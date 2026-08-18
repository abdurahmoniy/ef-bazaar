package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;
import uz.efbazaar.payment.wallet.service.TradeEscrowService;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Escrow against a real PostgreSQL, because the guarantee being tested is a
 * database one: balanced postings inside a single transaction.
 */
@SpringBootTest
class TradeEscrowServiceIT extends AbstractPostgresIT {

    /**
     * Stand-in proposer for the sale cases, which never charge them: a sale's
     * fee always comes out of what the buyer paid.
     */
    private static final UUID PROPOSER = UUID.randomUUID();

    @Autowired TradeEscrowService escrow;
    @Autowired LedgerService ledger;

    /** Puts real money in a wallet the only way the ledger allows. */
    private UUID fundedUser(long tiyin) {
        UUID user = UUID.randomUUID();
        ledger.post(TransactionKind.DEPOSIT, "seed-" + UUID.randomUUID(), null, null,
                List.of(new Posting(LedgerAccount.PLATFORM_CARDS, null, tiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, user, -tiyin)));
        return user;
    }

    @Test
    void holdMovesTheMoneyOutOfReachWithoutLosingIt() {
        UUID buyer = fundedUser(50_000_000L);   // 500 000 so'm

        escrow.hold(UUID.randomUUID(), buyer, PROPOSER, 50_000_000L, 50_000_000L);

        var w = ledger.balanceOf(buyer);
        assertThat(w.getAvailableTiyin()).isZero();
        assertThat(w.getHeldTiyin()).isEqualTo(50_000_000L);
    }

    @Test
    void aBuyerWhoCannotAffordItIsRefusedAndNothingMoves() {
        UUID buyer = fundedUser(10_000_000L);   // 100 000 so'm

        assertThatThrownBy(() -> escrow.hold(UUID.randomUUID(), buyer, PROPOSER, 50_000_000L, 50_000_000L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");

        var w = ledger.balanceOf(buyer);
        assertThat(w.getAvailableTiyin()).isEqualTo(10_000_000L);
        assertThat(w.getHeldTiyin()).isZero();
    }

    @Test
    void settleSplitsTheEscrowBetweenSellerAndPlatform() {
        UUID trade = UUID.randomUUID();
        UUID buyer = fundedUser(50_000_000L);
        UUID seller = UUID.randomUUID();
        escrow.hold(trade, buyer, PROPOSER, 50_000_000L, 50_000_000L);

        escrow.settle(trade, buyer, seller, 50_000_000L, 50_000_000L);

        // 500 000 so'm at 7.5% → fee 37 500, seller 462 500.
        assertThat(ledger.balanceOf(seller).getAvailableTiyin()).isEqualTo(46_250_000L);
        var b = ledger.balanceOf(buyer);
        assertThat(b.getHeldTiyin()).as("escrow drained").isZero();
        assertThat(b.getAvailableTiyin()).as("buyer gets nothing back").isZero();
    }

    @Test
    void releaseGivesTheBuyerEverythingBack() {
        UUID trade = UUID.randomUUID();
        UUID buyer = fundedUser(50_000_000L);
        escrow.hold(trade, buyer, PROPOSER, 50_000_000L, 50_000_000L);

        escrow.release(trade, buyer, PROPOSER, 50_000_000L, 50_000_000L);

        var w = ledger.balanceOf(buyer);
        assertThat(w.getAvailableTiyin()).as("no fee on a trade that did not happen")
                .isEqualTo(50_000_000L);
        assertThat(w.getHeldTiyin()).isZero();
    }

    @Test
    void aRepeatedSettleCreditsTheSellerOnce() {
        UUID trade = UUID.randomUUID();
        UUID buyer = fundedUser(50_000_000L);
        UUID seller = UUID.randomUUID();
        escrow.hold(trade, buyer, PROPOSER, 50_000_000L, 50_000_000L);

        escrow.settle(trade, buyer, seller, 50_000_000L, 50_000_000L);
        escrow.settle(trade, buyer, seller, 50_000_000L, 50_000_000L);   // lost response, retried

        assertThat(ledger.balanceOf(seller).getAvailableTiyin()).isEqualTo(46_250_000L);
        assertThat(ledger.balanceOf(buyer).getHeldTiyin()).isZero();
    }

    @Test
    void aRepeatedHoldFreezesOnce() {
        UUID trade = UUID.randomUUID();
        UUID buyer = fundedUser(100_000_000L);

        escrow.hold(trade, buyer, PROPOSER, 50_000_000L, 50_000_000L);
        escrow.hold(trade, buyer, PROPOSER, 50_000_000L, 50_000_000L);

        var w = ledger.balanceOf(buyer);
        assertThat(w.getHeldTiyin()).isEqualTo(50_000_000L);
        assertThat(w.getAvailableTiyin()).isEqualTo(50_000_000L);
    }

    @Test
    void twoTradesByTheSameBuyerAreSeparateEscrows() {
        UUID buyer = fundedUser(100_000_000L);
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();

        escrow.hold(first, buyer, PROPOSER, 50_000_000L, 50_000_000L);
        escrow.hold(second, buyer, PROPOSER, 50_000_000L, 50_000_000L);
        escrow.release(first, buyer, PROPOSER, 50_000_000L, 50_000_000L);

        var w = ledger.balanceOf(buyer);
        assertThat(w.getHeldTiyin()).as("only the released one came back").isEqualTo(50_000_000L);
        assertThat(w.getAvailableTiyin()).isEqualTo(50_000_000L);
    }

    @Test
    void aTradeTooSmallToCarryTheFeeIsRefused() {
        UUID buyer = fundedUser(10_000_000L);

        assertThatThrownBy(() -> escrow.hold(UUID.randomUUID(), buyer, PROPOSER, 100_000L, 100_000L)) // 1 000 so'm
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void moneyIsNeverCreatedOrDestroyed() {
        UUID buyer = fundedUser(50_000_000L);
        UUID seller = UUID.randomUUID();
        UUID trade = UUID.randomUUID();

        escrow.hold(trade, buyer, PROPOSER, 50_000_000L, 50_000_000L);
        escrow.settle(trade, buyer, seller, 50_000_000L, 50_000_000L);

        long buyerTotal = ledger.balanceOf(buyer).getAvailableTiyin()
                + ledger.balanceOf(buyer).getHeldTiyin();
        long sellerTotal = ledger.balanceOf(seller).getAvailableTiyin();
        long fee = 50_000_000L - sellerTotal;

        assertThat(buyerTotal + sellerTotal + fee)
                .as("every tiyin the buyer put in is somewhere")
                .isEqualTo(50_000_000L);
    }

    @Test
    void aTradeThatNeverHeldAnythingIsNotRefunded() {
        // Found in production: every trade that existed before escrow shipped
        // got escrow_resolved_at = NULL from the migration, so the sweeper read
        // them as owing a refund and asked for one once a minute. Posting it
        // drove held negative and chk_wallet_non_negative refused, which the
        // caller saw as a 409 it could never satisfy.
        UUID buyer = fundedUser(50_000_000L);

        escrow.release(UUID.randomUUID(), buyer, PROPOSER, 50_000_000L, 50_000_000L);   // no hold ever

        var w = ledger.balanceOf(buyer);
        assertThat(w.getAvailableTiyin())
                .as("a refund for money never taken must not invent money")
                .isEqualTo(50_000_000L);
        assertThat(w.getHeldTiyin()).isZero();
    }

    @Test
    void aTradeThatNeverHeldAnythingPaysNobodyOnSettle() {
        UUID buyer = fundedUser(50_000_000L);
        UUID seller = UUID.randomUUID();

        escrow.settle(UUID.randomUUID(), buyer, seller, 50_000_000L, 50_000_000L);

        assertThat(ledger.balanceOf(seller).getAvailableTiyin())
                .as("paying a seller out of an escrow that was never collected "
                        + "would create money from nothing")
                .isZero();
        assertThat(ledger.balanceOf(buyer).getAvailableTiyin()).isEqualTo(50_000_000L);
    }

    @Test
    void aRealEscrowIsStillSettledNormally() {
        // The guard must not swallow the case it is not for.
        UUID trade = UUID.randomUUID();
        UUID buyer = fundedUser(50_000_000L);
        UUID seller = UUID.randomUUID();

        escrow.hold(trade, buyer, PROPOSER, 50_000_000L, 50_000_000L);
        escrow.settle(trade, buyer, seller, 50_000_000L, 50_000_000L);

        assertThat(ledger.balanceOf(seller).getAvailableTiyin()).isEqualTo(46_250_000L);
    }

    // ---------- swaps ----------
    //
    // A swap moves two accounts and, on its own, no money — but the platform is
    // still paid. The fee is worked out from the listing price, the value of
    // the account being given up, so a token surcharge cannot buy a cheaper
    // trade. It is charged to the PROPOSER, who on a plain swap receives
    // nothing to deduct it from and so funds it from their own wallet.

    /** 500 000 so'm listing → 7.5% → 37 500 so'm fee. */
    private static final long LISTING = 50_000_000L;
    private static final long LISTING_FEE = 3_750_000L;

    @Test
    void aPlainSwapChargesTheProposerAndNobodyElse() {
        UUID proposer = fundedUser(10_000_000L);
        UUID accepter = fundedUser(10_000_000L);
        UUID trade = UUID.randomUUID();

        escrow.hold(trade, accepter, proposer, 0L, LISTING);

        assertThat(ledger.balanceOf(proposer).getHeldTiyin())
                .as("the fee, frozen until the swap closes").isEqualTo(LISTING_FEE);
        assertThat(ledger.balanceOf(accepter).getHeldTiyin())
                .as("nothing is asked of the accepter on a plain swap").isZero();
    }

    @Test
    void aCompletedPlainSwapPaysThePlatformAndReturnsNothing() {
        UUID proposer = fundedUser(10_000_000L);
        UUID accepter = fundedUser(10_000_000L);
        UUID trade = UUID.randomUUID();
        escrow.hold(trade, accepter, proposer, 0L, LISTING);

        escrow.settle(trade, accepter, proposer, 0L, LISTING);

        var p = ledger.balanceOf(proposer);
        assertThat(p.getHeldTiyin()).isZero();
        assertThat(p.getAvailableTiyin())
                .as("the fee is spent, not returned")
                .isEqualTo(10_000_000L - LISTING_FEE);
        assertThat(ledger.balanceOf(accepter).getAvailableTiyin()).isEqualTo(10_000_000L);
    }

    @Test
    void aProposerWhoCannotAffordTheFeeIsRefused() {
        UUID proposer = fundedUser(1_000_000L);   // 10 000 so'm, fee is 37 500
        UUID accepter = fundedUser(10_000_000L);

        assertThatThrownBy(() -> escrow.hold(UUID.randomUUID(), accepter, proposer, 0L, LISTING))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");

        assertThat(ledger.balanceOf(proposer).getHeldTiyin()).isZero();
        assertThat(ledger.balanceOf(accepter).getHeldTiyin())
                .as("the accepter must not be frozen for a swap that cannot start")
                .isZero();
    }

    @Test
    void aSurchargeLargerThanTheFeeLeavesTheProposerInProfit() {
        // 500 000 surcharge on a 500 000 listing: fee 37 500, proposer nets
        // 462 500 and funds nothing.
        UUID proposer = fundedUser(1_000_000L);
        UUID accepter = fundedUser(60_000_000L);
        UUID trade = UUID.randomUUID();

        escrow.hold(trade, accepter, proposer, LISTING, LISTING);
        assertThat(ledger.balanceOf(proposer).getHeldTiyin())
                .as("the surcharge covers the fee, so the proposer funds none of it")
                .isZero();

        escrow.settle(trade, accepter, proposer, LISTING, LISTING);

        assertThat(ledger.balanceOf(proposer).getAvailableTiyin())
                .isEqualTo(1_000_000L + LISTING - LISTING_FEE);
    }

    @Test
    void aTokenSurchargeStillCostsTheProposerTheRealFee() {
        // The hole this closes: 10 000 so'm on top of a 500 000 account must
        // not turn a 37 500 fee into the 5 000 floor. The proposer receives the
        // 10 000 and funds the remaining 27 500 themselves.
        long token = 1_000_000L;   // 10 000 so'm
        UUID proposer = fundedUser(10_000_000L);
        UUID accepter = fundedUser(10_000_000L);
        UUID trade = UUID.randomUUID();

        escrow.hold(trade, accepter, proposer, token, LISTING);
        assertThat(ledger.balanceOf(proposer).getHeldTiyin())
                .as("only the part the surcharge does not cover")
                .isEqualTo(LISTING_FEE - token);

        escrow.settle(trade, accepter, proposer, token, LISTING);

        assertThat(ledger.balanceOf(proposer).getAvailableTiyin())
                .as("net cost is the fee less what the accepter paid")
                .isEqualTo(10_000_000L - (LISTING_FEE - token));
        assertThat(ledger.balanceOf(accepter).getAvailableTiyin())
                .isEqualTo(10_000_000L - token);
    }

    @Test
    void aCancelledSwapCostsNobodyAnything() {
        long token = 1_000_000L;
        UUID proposer = fundedUser(10_000_000L);
        UUID accepter = fundedUser(10_000_000L);
        UUID trade = UUID.randomUUID();
        escrow.hold(trade, accepter, proposer, token, LISTING);

        escrow.release(trade, accepter, proposer, token, LISTING);

        assertThat(ledger.balanceOf(proposer).getAvailableTiyin()).isEqualTo(10_000_000L);
        assertThat(ledger.balanceOf(accepter).getAvailableTiyin()).isEqualTo(10_000_000L);
        assertThat(ledger.balanceOf(proposer).getHeldTiyin()).isZero();
        assertThat(ledger.balanceOf(accepter).getHeldTiyin()).isZero();
    }

    @Test
    void aSwapCreatesNoMoneyAndDestroysNone() {
        long token = 1_000_000L;
        UUID proposer = fundedUser(10_000_000L);
        UUID accepter = fundedUser(10_000_000L);
        UUID trade = UUID.randomUUID();

        escrow.hold(trade, accepter, proposer, token, LISTING);
        escrow.settle(trade, accepter, proposer, token, LISTING);

        long proposerTotal = ledger.balanceOf(proposer).getAvailableTiyin()
                + ledger.balanceOf(proposer).getHeldTiyin();
        long accepterTotal = ledger.balanceOf(accepter).getAvailableTiyin()
                + ledger.balanceOf(accepter).getHeldTiyin();

        assertThat(proposerTotal + accepterTotal + LISTING_FEE)
                .as("every tiyin is either still with a party or with the platform")
                .isEqualTo(20_000_000L);
    }
}
