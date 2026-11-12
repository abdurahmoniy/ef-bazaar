package uz.efbazaar.payment.history.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.payment.debit.domain.CardDebitObservation;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;

import java.time.Instant;
import java.util.UUID;

/**
 * One movement on a platform card, whichever direction it went.
 *
 * <p>Two tables, one row shape. The tables stay separate — a debit must never
 * reach the credit reconciliation queue, where an admin could attribute it to a
 * user and create money — but the question "what happened on this card today"
 * is one question, and answering it from two lists an admin has to interleave
 * by eye is how a movement gets missed.
 *
 * <p>{@code amountTiyin} is always positive. The direction is a field, not a
 * sign, so nothing downstream can negate it twice.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CardMovementResponse(
        UUID id,
        Direction direction,
        String cardLast4,
        long amountTiyin,
        Long commissionTiyin,
        /** What the card held afterwards, when the bank's notice said. */
        Long cardBalanceTiyin,
        /** Debits only: the bank's own words for where the money went. */
        String description,
        /** Credits only: whether it was matched to an invoice, queued, or ignored. */
        String creditStatus,
        /**
         * Credits only: the user whose wallet the money went to — the invoice's
         * owner when matched, the chosen user when an admin resolved it by hand.
         * Null while nobody has accounted for it, and always null on a debit.
         */
        UUID ownerUserId,
        Instant observedAt
) {

    public enum Direction {
        /** A top-up arriving on the card. */
        IN,
        /** Money leaving it — a payout, or something nobody expected. */
        OUT
    }

    /**
     * @param invoiceOwner the user of the invoice the credit was matched to, or
     *                     null when it was not matched to one
     */
    public static CardMovementResponse of(CardCreditObservation c, UUID invoiceOwner) {
        UUID owner = invoiceOwner != null ? invoiceOwner : c.getResolvedUserId();
        return new CardMovementResponse(
                c.getId(), Direction.IN, c.getCardLast4(), c.getAmountTiyin(),
                null, c.getCardBalanceTiyin(), null, c.getStatus().name(), owner,
                c.getObservedAt());
    }

    public static CardMovementResponse of(CardDebitObservation d) {
        return new CardMovementResponse(
                d.getId(), Direction.OUT, d.getCardLast4(), d.getAmountTiyin(),
                d.getCommissionTiyin(), d.getCardBalanceTiyin(), d.getDescription(),
                null, null, d.getObservedAt());
    }
}
