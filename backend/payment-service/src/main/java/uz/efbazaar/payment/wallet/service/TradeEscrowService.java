package uz.efbazaar.payment.wallet.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.domain.WalletAccount;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

/**
 * Escrow for a smart-admin trade: freeze the buyer's money, then either pay
 * the seller or give it back.
 *
 * <p>Each of the three movements is one {@link LedgerService#post} call, so it
 * is one database transaction over balanced postings. "Debited one side and
 * failed to credit the other" is not a state this can reach: either every
 * posting lands or none does. What crosses a service boundary is only the
 * decision to move, never a half-moved balance.
 *
 * <p>Every movement is keyed by trade id, so a retry after a lost response
 * settles nothing twice — {@code post} returns the original transaction and
 * writes nothing.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeEscrowService {

    private final LedgerService ledger;
    private final TradeCommissionService commissionService;

    /**
     * Freezes what each party owes.
     *
     * <p>Two amounts, one transaction. The accepter owes {@code accepterTiyin}
     * — the price on a sale, the surcharge on a swap that has one, nothing on a
     * plain swap. The proposer owes the platform's fee, and pays it from their
     * own wallet only for the part the accepter's money does not cover: on a
     * sale all of it is covered, on a plain swap none of it.
     *
     * <p>{@code feeBaseTiyin} is what the fee is calculated from, and is not
     * always what changes hands: on a swap it is the listing price, the value
     * of the account being given up. Basing it on the surcharge instead would
     * let a token 1 000 so'm top-up turn a 37 500 fee into the floor.
     *
     * <p>Refuses rather than overdrawing. {@code chk_wallet_non_negative} would
     * catch it too, but a constraint violation dooms the transaction and the
     * caller gets a 409 about nothing instead of a clear "not enough money".
     */
    @Transactional
    public void hold(UUID tradeId, UUID accepterId, UUID proposerId,
                     long accepterTiyin, long feeBaseTiyin) {
        if (accepterTiyin < 0) {
            throw new IllegalArgumentException("Accepter amount cannot be negative");
        }
        requirePositive(feeBaseTiyin);
        if (feeBaseTiyin < commissionService.minimumViablePriceTiyin()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Savdo summasi juda kichik — eng kami "
                            + commissionService.minimumViablePriceTiyin() / 100 + " so'm");
        }

        long fee = commissionService.feeTiyin(feeBaseTiyin);
        long proposerOwes = Math.max(0, fee - accepterTiyin);

        requireFunds(accepterId, accepterTiyin, "Hamyoningizda");
        // On a sale this is always zero and the proposer is never consulted.
        // On a swap it is the platform's fee, and the accepter cannot do
        // anything about it — so the message has to say whose wallet it is.
        requireFunds(proposerId, proposerOwes, "Taklif yuboruvchining hamyonida");

        var postings = new java.util.ArrayList<Posting>(4);
        if (accepterTiyin > 0) {
            postings.add(new Posting(LedgerAccount.USER_AVAILABLE, accepterId, accepterTiyin));
            postings.add(new Posting(LedgerAccount.USER_HELD, accepterId, -accepterTiyin));
        }
        if (proposerOwes > 0) {
            postings.add(new Posting(LedgerAccount.USER_AVAILABLE, proposerId, proposerOwes));
            postings.add(new Posting(LedgerAccount.USER_HELD, proposerId, -proposerOwes));
        }
        // Never empty: a zero accepter amount forces proposerOwes to the whole
        // fee, which is positive by construction.

        ledger.post(TransactionKind.TRADE_HOLD, key("hold", tradeId), null,
                "trade " + tradeId + " fee " + fee, postings);
    }

    private void requireFunds(UUID userId, long tiyin, String whose) {
        if (tiyin <= 0) return;
        long available = ledger.balanceOf(userId).getAvailableTiyin();
        if (available < tiyin) {
            // Names the amount as well as the wallet: "not enough" without a
            // number leaves the user to work out what to top up.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    whose + " mablag' yetarli emas — " + ((tiyin - available) / 100)
                            + " so'm yetishmayapti");
        }
    }

    /**
     * Ends the trade in the proposer's favour: escrow drains, less the
     * platform's share.
     *
     * <p>One transaction. The proposer cannot be credited without both holds
     * being released, and the platform cannot take a fee without either.
     *
     * <p>The proposer's own hold exists only when the fee outran what the
     * accepter paid — a swap of a dear account for a token surcharge. It is
     * consumed here rather than returned: it is the fee.
     */
    @Transactional
    public void settle(UUID tradeId, UUID accepterId, UUID proposerId,
                       long accepterTiyin, long feeBaseTiyin) {
        requirePositive(feeBaseTiyin);
        if (neverHeld(tradeId, "settle")) return;

        long fee = commissionService.feeTiyin(feeBaseTiyin);
        long proposerOwes = Math.max(0, fee - accepterTiyin);
        long proceeds = Math.max(0, accepterTiyin - fee);

        var postings = new java.util.ArrayList<Posting>(4);
        if (accepterTiyin > 0) {
            postings.add(new Posting(LedgerAccount.USER_HELD, accepterId, accepterTiyin));
        }
        if (proposerOwes > 0) {
            postings.add(new Posting(LedgerAccount.USER_HELD, proposerId, proposerOwes));
        }
        if (proceeds > 0) {
            postings.add(new Posting(LedgerAccount.USER_AVAILABLE, proposerId, -proceeds));
        }
        // Omitted when zero rather than written as zero: chk_entry_non_zero
        // rejects a zero posting. fee is positive whenever feeBase is.
        postings.add(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -fee));

        ledger.post(TransactionKind.TRADE_SETTLE, key("settle", tradeId), null,
                "trade " + tradeId + " fee " + fee, postings);
        log.info("Trade {} settled: proposer {} received {} tiyin, platform kept {}",
                tradeId, proposerId, proceeds, fee);
    }

    /**
     * Ends the trade without a deal: every hold goes back, whole.
     *
     * <p>No fee, on either side. The platform charges for a completed trade and
     * this is not one — a service that was not delivered is not billed for.
     */
    @Transactional
    public void release(UUID tradeId, UUID accepterId, UUID proposerId,
                        long accepterTiyin, long feeBaseTiyin) {
        requirePositive(feeBaseTiyin);
        if (neverHeld(tradeId, "release")) return;

        long proposerOwes = Math.max(0, commissionService.feeTiyin(feeBaseTiyin) - accepterTiyin);

        var postings = new java.util.ArrayList<Posting>(4);
        if (accepterTiyin > 0) {
            postings.add(new Posting(LedgerAccount.USER_HELD, accepterId, accepterTiyin));
            postings.add(new Posting(LedgerAccount.USER_AVAILABLE, accepterId, -accepterTiyin));
        }
        if (proposerOwes > 0) {
            postings.add(new Posting(LedgerAccount.USER_HELD, proposerId, proposerOwes));
            postings.add(new Posting(LedgerAccount.USER_AVAILABLE, proposerId, -proposerOwes));
        }

        ledger.post(TransactionKind.TRADE_RELEASE, key("release", tradeId), null,
                "trade " + tradeId, postings);
    }

    private boolean neverHeld(UUID tradeId, String action) {
        if (ledger.hasPosted(key("hold", tradeId))) return false;
        log.info("Trade {} has no escrow hold — nothing to {}; it predates the wallet",
                tradeId, action);
        return true;
    }

    private static String key(String action, UUID tradeId) {
        return "trade-" + action + "-" + tradeId;
    }

    private static void requirePositive(long priceTiyin) {
        if (priceTiyin <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Savdo summasi musbat bo'lishi kerak");
        }
    }
}
