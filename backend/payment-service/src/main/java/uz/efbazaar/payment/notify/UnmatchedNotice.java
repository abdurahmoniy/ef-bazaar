package uz.efbazaar.payment.notify;

import java.time.Instant;
import java.util.UUID;

/**
 * A credit that named no live invoice, resolved for the admin topic.
 *
 * <p>No entities and no PAN cross this line, same rule as {@link InvoiceNotice}.
 * The card is the last four digits; that is what tells an admin which card was
 * hit, and it is all {@code rawText} carries either.
 *
 * <p>{@code amountTiyin} is what actually arrived, which is why this record
 * keeps tiyin rather than so'm: an invoice amount is whole so'm by
 * construction, but a payment nobody asked for can be any number at all.
 */
public record UnmatchedNotice(
        UUID observationId,
        String cardLast4,
        long amountTiyin,
        Instant observedAt) {}
