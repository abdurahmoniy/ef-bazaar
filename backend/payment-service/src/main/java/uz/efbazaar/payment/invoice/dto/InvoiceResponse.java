package uz.efbazaar.payment.invoice.dto;

import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * What the payer sees. The PAN is present deliberately — the user cannot make
 * the transfer without it. It is only ever returned to the user who owns the
 * invoice.
 */
public record InvoiceResponse(
        UUID id,
        String pan,
        String holderName,
        String cardExpiry,
        long requestedTiyin,
        long transferTiyin,
        Instant expiresAt,
        InvoiceStatus status
) {
    public static InvoiceResponse of(Invoice i, String pan, String holderName, String expiry) {
        return new InvoiceResponse(
                i.getId(), pan, holderName, expiry,
                i.getRequestedAmountTiyin(), i.getTransferAmountTiyin(),
                i.getExpiresAt(), i.getStatus());
    }
}
