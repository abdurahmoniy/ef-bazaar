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

    /**
     * Moves the price from the buyer's spendable balance into escrow.
     *
     * <p>Refuses rather than overdrawing. {@code chk_wallet_non_negative} would
     * catch it too, but a constraint violation dooms the transaction and the
     * caller gets a 409 about nothing instead of a clear "not enough money".
     */
    @Transactional
    public void hold(UUID tradeId, UUID buyerId, long priceTiyin) {
        requirePositive(priceTiyin);
        if (priceTiyin < TradeCommission.minimumViablePriceTiyin()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Savdo summasi juda kichik — eng kami "
                            + TradeCommission.minimumViablePriceTiyin() / 100 + " so'm");
        }

        WalletAccount w = ledger.balanceOf(buyerId);
        if (w.getAvailableTiyin() < priceTiyin) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Hamyonda mablag' yetarli emas");
        }

        ledger.post(TransactionKind.TRADE_HOLD, key("hold", tradeId), null,
                "trade " + tradeId,
                List.of(new Posting(LedgerAccount.USER_AVAILABLE, buyerId, priceTiyin),
                        new Posting(LedgerAccount.USER_HELD, buyerId, -priceTiyin)));
    }

    /**
     * Ends the trade in the seller's favour: escrow drains to the seller, less
     * the platform's share.
     *
     * <p>The three postings are one transaction. The seller cannot be credited
     * without the buyer's hold being released, and the platform cannot take a
     * fee without both.
     */
    @Transactional
    public void settle(UUID tradeId, UUID buyerId, UUID sellerId, long priceTiyin) {
        requirePositive(priceTiyin);
        if (neverHeld(tradeId, "settle")) return;
        long fee = TradeCommission.feeTiyin(priceTiyin);
        long proceeds = priceTiyin - fee;

        var postings = new java.util.ArrayList<Posting>(3);
        postings.add(new Posting(LedgerAccount.USER_HELD, buyerId, priceTiyin));
        if (proceeds > 0) {
            postings.add(new Posting(LedgerAccount.USER_AVAILABLE, sellerId, -proceeds));
        }
        if (fee > 0) {
            // Omitted when zero rather than written as zero: chk_entry_non_zero
            // rejects a zero posting. fee is only zero if the price is, which
            // requirePositive already refused.
            postings.add(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -fee));
        }

        ledger.post(TransactionKind.TRADE_SETTLE, key("settle", tradeId), null,
                "trade " + tradeId + " fee " + fee, postings);
        log.info("Trade {} settled: seller {} received {} tiyin, platform kept {}",
                tradeId, sellerId, proceeds, fee);
    }

    /**
     * Ends the trade without a sale: escrow goes back to the buyer, whole.
     *
     * <p>No fee. The platform charges for a completed trade, and this is not
     * one — a service that was not delivered is not billed for.
     */
    @Transactional
    public void release(UUID tradeId, UUID buyerId, long priceTiyin) {
        requirePositive(priceTiyin);
        if (neverHeld(tradeId, "release")) return;
        ledger.post(TransactionKind.TRADE_RELEASE, key("release", tradeId), null,
                "trade " + tradeId,
                List.of(new Posting(LedgerAccount.USER_HELD, buyerId, priceTiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, buyerId, -priceTiyin)));
    }

    /**
     * True when this trade never had money frozen, in which case there is
     * nothing to settle or release and the caller is done.
     *
     * <p>Trades that predate escrow are exactly this: the sweeper sees them as
     * terminal with no resolution recorded and asks for a movement, and posting
     * one would drive the buyer's held balance negative — which is what
     * chk_wallet_non_negative caught in production, once a minute per trade,
     * as a 409 the sweeper could never satisfy.
     *
     * <p>Checked against the hold transaction rather than the balance, which
     * cannot tell "never held" from "already released". Under the current code
     * a SMART trade cannot exist without a successful hold, so a missing one
     * always means the trade came from before this feature.
     */
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
