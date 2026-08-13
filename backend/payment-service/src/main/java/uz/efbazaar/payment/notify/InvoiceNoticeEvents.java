package uz.efbazaar.payment.notify;

import java.util.List;
import java.util.UUID;

/** Signals for the admin topic, published inside a transaction, acted on after it commits. */
public final class InvoiceNoticeEvents {

    private InvoiceNoticeEvents() {}

    public record InvoicePaid(UUID invoiceId) {}

    /** Only message ids: an expired invoice needs its notice gone, nothing else. */
    public record InvoicesExpired(List<Long> messageIds) {}
}
