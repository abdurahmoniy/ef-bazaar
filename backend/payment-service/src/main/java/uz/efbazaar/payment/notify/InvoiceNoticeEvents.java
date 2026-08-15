package uz.efbazaar.payment.notify;

import java.util.List;
import java.util.UUID;

/** Signals for the admin topic, published inside a transaction, acted on after it commits. */
public final class InvoiceNoticeEvents {

    private InvoiceNoticeEvents() {}

    public record InvoicePaid(UUID invoiceId) {}

    /** Only message ids: an expired invoice needs its notice gone, nothing else. */
    public record InvoicesExpired(List<Long> messageIds) {}

    /**
     * A payment arrived that names no live invoice. This is the one case in the
     * whole rail that needs a human, and until now it was the only one the
     * topic never mentioned — the card owners watch Telegram, not the admin
     * panel, so an unmatched credit could sit in the queue unseen.
     */
    public record UnmatchedCredit(UUID observationId) {}

    /**
     * A withdrawal ticket was opened and its money frozen.
     *
     * <p>Carries the id only, like the rest: the listener re-reads the row
     * after commit, so a notice can never describe a ticket that rolled back.
     */
    public record WithdrawalOpened(UUID ticketId) {}

    /** Paid or refunded — the listener re-reads the row to find out which. */
    public record WithdrawalClosed(UUID ticketId) {}
}
