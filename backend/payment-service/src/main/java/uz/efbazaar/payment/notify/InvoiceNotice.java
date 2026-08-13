package uz.efbazaar.payment.notify;

import java.time.Instant;
import java.util.UUID;

/**
 * Everything a notice needs, already resolved. No entities cross this line —
 * and in particular no PAN: the card is identified by its last four digits and
 * the holder name, which is all an admin needs to know which card was hit.
 */
public record InvoiceNotice(
        UUID invoiceId,
        UUID userId,
        String cardLast4,
        String holderName,
        long requestedAmountTiyin,
        long transferAmountTiyin,
        Instant expiresAt,
        Instant paidAt) {}
