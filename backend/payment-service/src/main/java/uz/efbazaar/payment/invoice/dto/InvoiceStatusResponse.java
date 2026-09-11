package uz.efbazaar.payment.invoice.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;

import java.util.UUID;

/**
 * Just enough for an open page to learn its transfer has landed.
 *
 * <p><b>Deliberately not {@link InvoiceResponse}.</b> That one carries the full
 * card number, and building it decrypts the PAN. A page waiting for a payment
 * asks this question every few seconds; answering it with the PAN would put the
 * platform's card number on the wire a few hundred times per deposit, for a
 * question that never needed it.
 *
 * @param creditedTiyin what reached the wallet, or null while nothing has. Not
 *                      the transfer amount: a bumped invoice asks for a few
 *                      tiyin more so the incoming bank notification can be told
 *                      apart from somebody else's, and showing that here would
 *                      tell the user they received more than they did.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record InvoiceStatusResponse(UUID id, InvoiceStatus status, Long creditedTiyin) {

    public static InvoiceStatusResponse of(Invoice invoice) {
        return new InvoiceStatusResponse(
                invoice.getId(),
                invoice.getStatus(),
                invoice.getStatus() == InvoiceStatus.PAID
                        ? invoice.getRequestedAmountTiyin()
                        : null);
    }
}
