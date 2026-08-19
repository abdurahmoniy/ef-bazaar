package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeSideRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Each party's own progress, and the gate that decides when the trade may move.
 *
 * <p>A sale asks the seller to change an email, run forgot-password and send a
 * password, and asks the buyer only to confirm at the end. A swap asks both
 * parties for all of it, at their own pace, which the single {@code state}
 * column cannot describe. So the state now means the slowest side: an event
 * from one party is recorded here, and only advances the trade once the other
 * party has cleared the same bar.
 *
 * <p>On a sale the gate is transparent. The buyer has no email to change, so
 * "both sides done" is true as soon as the seller is done — which is exactly
 * the old behaviour.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeSideService {

    private final TradeSideRepository sides;

    /**
     * Creates the two rows a trade is tracked by.
     *
     * <p>The buyer gets a mailbox only on a swap: on a sale they hand over
     * nothing, and a mailbox nobody moves an account into would be provisioned,
     * rotated and paid for to no purpose.
     */
    @Transactional
    public void open(UUID tradeId, UUID sellerMailboxId, UUID buyerMailboxId) {
        sides.save(TradeSide.builder()
                .id(new TradeSideId(tradeId, ParticipantRole.SELLER))
                .mailboxId(sellerMailboxId)
                .build());
        sides.save(TradeSide.builder()
                .id(new TradeSideId(tradeId, ParticipantRole.BUYER))
                .mailboxId(buyerMailboxId)
                .build());
    }

    @Transactional(readOnly = true)
    public List<TradeSide> of(UUID tradeId) {
        return sides.findByIdTradeId(tradeId);
    }

    @Transactional(readOnly = true)
    public Optional<TradeSide> of(UUID tradeId, ParticipantRole role) {
        return sides.find(tradeId, role);
    }

    /** Which side owns this mailbox — how a worker event finds its party. */
    @Transactional(readOnly = true)
    public Optional<TradeSide> byMailbox(UUID tradeId, UUID mailboxId) {
        if (mailboxId == null) return Optional.empty();
        return sides.findByIdTradeId(tradeId).stream()
                .filter(s -> mailboxId.equals(s.getMailboxId()))
                .findFirst();
    }

    /**
     * Records that this party has cleared the bar the event describes.
     *
     * <p>Idempotent: a redelivered Kafka record or a double-clicked button
     * keeps the first timestamp, because the first one is when it happened.
     */
    @Transactional
    public void stamp(UUID tradeId, ParticipantRole role, TradeEvent event) {
        sides.find(tradeId, role).ifPresent(side -> {
            Instant now = Instant.now();
            switch (event) {
                case EMAIL_CHANGED -> {
                    if (side.getEmailChangedAt() == null) side.setEmailChangedAt(now);
                }
                case KONAMI_EMAIL_RECEIVED -> {
                    if (side.getKonamiVerifiedAt() == null) side.setKonamiVerifiedAt(now);
                }
                case PASSWORD_SENT -> {
                    if (side.getPasswordSentAt() == null) side.setPasswordSentAt(now);
                }
                case BUYER_CONFIRM -> {
                    if (!side.hasDecided()) side.setConfirmedAt(now);
                }
                case BUYER_REJECT -> {
                    if (!side.hasDecided()) side.setRejectedAt(now);
                }
                default -> { /* not a per-side step */ }
            }
            sides.save(side);
        });
    }

    /**
     * Records a step reported by the worker, which does not say which mailbox
     * it is about.
     *
     * <p>{@code KonamiEmailReceived} carries only a trade id, so on a swap the
     * two reports — one per mailbox — are indistinguishable. Each is stamped
     * against whichever side is still outstanding. The attribution is therefore
     * approximate, but the gate is exact, which is what matters: the trade
     * advances only once as many reports have arrived as there are mailboxes.
     *
     * <p>Making it exact needs an address on the event, which is a
     * smart-admin-worker change.
     */
    @Transactional
    public void stampNextPending(UUID tradeId, TradeEvent event) {
        sides.findByIdTradeId(tradeId).stream()
                .filter(s -> s.getMailboxId() != null)
                .filter(s -> !cleared(s, event))
                .findFirst()
                .ifPresent(s -> stamp(tradeId, s.role(), event));
    }

    /**
     * Whether the trade may now move on this event.
     *
     * <p>Only a swap has a second side to wait for. On a sale the counterpart
     * is not asked for this step at all, so the answer is always yes and the
     * flow is untouched.
     */
    @Transactional(readOnly = true)
    public boolean bothSidesCleared(Trade trade, TradeEvent event) {
        if (!trade.getKind().isSwap()) return true;
        List<TradeSide> both = sides.findByIdTradeId(trade.getId());
        if (both.size() < 2) {
            // Pre-swap trades have rows from the backfill; a swap without both
            // is a bug, and blocking forever is worse than moving on.
            log.warn("Trade {} is a swap but has {} side rows — not gating",
                    trade.getId(), both.size());
            return true;
        }
        return both.stream().allMatch(s -> cleared(s, event));
    }

    private static boolean cleared(TradeSide side, TradeEvent event) {
        return switch (event) {
            case EMAIL_CHANGED -> side.getEmailChangedAt() != null;
            case KONAMI_EMAIL_RECEIVED -> side.getKonamiVerifiedAt() != null;
            case PASSWORD_SENT -> side.getPasswordSentAt() != null;
            case BUYER_CONFIRM, BUYER_REJECT -> side.hasDecided();
            default -> true;
        };
    }

    /**
     * Whether a swap ends with the accounts crossing over.
     *
     * <p>Only a clean yes from both. One rejection, or a party who never
     * answered, sends every account back where it came from — the platform does
     * not decide a swap on one voice.
     */
    @Transactional(readOnly = true)
    public boolean bothConfirmed(UUID tradeId) {
        List<TradeSide> both = sides.findByIdTradeId(tradeId);
        return both.size() == 2 && both.stream().allMatch(s -> s.getConfirmedAt() != null);
    }
}
