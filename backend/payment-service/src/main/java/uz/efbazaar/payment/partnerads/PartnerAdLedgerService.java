package uz.efbazaar.payment.partnerads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

/**
 * The money side of channel advertising: the seller's fee is frozen when the
 * order is placed, and released post by post as each one is delivered.
 *
 * <p>The same hold/settle shape trade escrow uses, for the same reason: the
 * seller must not be able to order a post they cannot pay for, and the partner
 * must not be paid for a post that never went out.
 *
 * <p>The hold is keyed on the <em>order</em> and every release on the
 * <em>post</em> — never on the listing. A seller may order more channels for
 * the same listing tomorrow, and a listing-keyed hold would look like a
 * redelivery to {@link LedgerService#post} and quietly take no money at all.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerAdLedgerService {

    private final LedgerService ledger;

    /**
     * Freezes the whole order in one transaction.
     *
     * <p>One hold for every channel in the order, not one per channel: a wallet
     * that covers two of three posts must buy none of them, so the seller never
     * ends up with a half-ordered campaign to unpick.
     *
     * @throws ResponseStatusException 409 when the wallet cannot cover the total
     */
    @Transactional
    public void hold(UUID orderId, UUID sellerId, long totalTiyin) {
        // Nothing to freeze, and chk_entry_non_zero rejects a zero posting.
        if (totalTiyin <= 0) return;
        requireFunds(sellerId, totalTiyin);

        ledger.post(TransactionKind.PARTNER_POST_HOLD,
                "partner-post-hold:" + orderId, null,
                "channel ad order " + orderId,
                List.of(
                        new Posting(LedgerAccount.USER_AVAILABLE, sellerId, totalTiyin),
                        new Posting(LedgerAccount.USER_HELD, sellerId, -totalTiyin)));

        log.info("Channel ad order {} held {} tiyin from seller {}", orderId, totalTiyin, sellerId);
    }

    /** The post went out: its slice of the hold becomes the partner's money. */
    @Transactional
    public void settle(UUID postId, UUID sellerId, UUID partnerUserId, long priceTiyin) {
        if (priceTiyin <= 0) return;

        ledger.post(TransactionKind.PARTNER_POST_SETTLE,
                "partner-post:" + postId, null,
                "channel ad post " + postId,
                List.of(
                        new Posting(LedgerAccount.USER_HELD, sellerId, priceTiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, partnerUserId, -priceTiyin)));

        log.info("Channel ad post {} settled {} tiyin to partner {}", postId, priceTiyin, partnerUserId);
    }

    /** The post never went out: its slice of the hold goes back to the seller. */
    @Transactional
    public void refund(UUID postId, UUID sellerId, long priceTiyin) {
        if (priceTiyin <= 0) return;

        ledger.post(TransactionKind.PARTNER_POST_REFUND,
                "partner-post-refund:" + postId, null,
                "channel ad post " + postId + " refund",
                List.of(
                        new Posting(LedgerAccount.USER_HELD, sellerId, priceTiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, sellerId, -priceTiyin)));

        log.info("Channel ad post {} refunded {} tiyin to seller {}", postId, priceTiyin, sellerId);
    }

    /**
     * The monthly payment a fixed-rate partner is owed for their channel.
     *
     * <p>Unlike the other three this is not a release of anyone's hold — the
     * platform pays it out of revenue, the way it pays a referral reward.
     *
     * @param period the payout month, {@code yyyy-MM}. It is half of the
     *               idempotency key, so a job that runs twice on the 1st pays
     *               once.
     */
    @Transactional
    public void monthly(UUID channelId, UUID partnerUserId, long amountTiyin, String period) {
        if (amountTiyin <= 0) return;

        ledger.post(TransactionKind.PARTNER_MONTHLY,
                "partner-monthly:" + channelId + ":" + period, null,
                "channel " + channelId + " monthly payout " + period,
                List.of(
                        new Posting(LedgerAccount.PLATFORM_REVENUE, null, amountTiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, partnerUserId, -amountTiyin)));

        log.info("Channel {} monthly payout {} tiyin to partner {} for {}",
                channelId, amountTiyin, partnerUserId, period);
    }

    private void requireFunds(UUID userId, long tiyin) {
        long available = ledger.balanceOf(userId).getAvailableTiyin();
        if (available < tiyin) {
            // Word for word the message PartnerFeeService raises: the frontend
            // recognises this exact shape with `isInsufficientFunds` and turns
            // the shortfall into a wallet top-up link.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Hamyonda mablag' yetarli emas — " + ((tiyin - available) / 100)
                            + " so'm yetishmayapti");
        }
    }
}
