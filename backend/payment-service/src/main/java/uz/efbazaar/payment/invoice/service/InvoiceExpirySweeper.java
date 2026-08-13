package uz.efbazaar.payment.invoice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.notify.InvoiceNoticeEvents;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Flips overdue PENDING invoices to EXPIRED, which releases their
 * {@code (card, amount)} slot for the next payer.
 *
 * <p>That release is exactly why a payment arriving after expiry is never
 * credited automatically: the slot it names may already belong to a different
 * user's live invoice.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InvoiceExpirySweeper {

    private final InvoiceRepository invoices;
    private final ApplicationEventPublisher appEvents;

    @Scheduled(fixedDelayString = "${payment.scheduler.expiry-sweep-interval-ms:30000}")
    @Transactional
    public void sweep() {
        List<Invoice> due = invoices.findDue(Instant.now());
        if (due.isEmpty()) {
            return;
        }
        List<UUID> ids = due.stream().map(Invoice::getId).toList();

        // A conditional UPDATE rather than saveAll of this snapshot. Between the
        // findDue above and the write below, an observation can credit one of
        // these invoices; a full-row save from the stale snapshot would then
        // land last and leave the row EXPIRED with paid_at and observation_id
        // erased, while the user has the money and the observation says MATCHED.
        // The money would be right and the reconciliation trail a lie. With the
        // status predicate the paid row simply is not matched.
        int expired = invoices.expireIfStillPending(ids);
        if (expired == 0) {
            return;
        }

        // Re-read after the update: only the rows this sweep really expired have
        // an announcement to take down. An invoice that was paid mid-sweep keeps
        // its notice, which the paid listener replaces with a receipt.
        List<Long> notices = invoices.findAllById(ids).stream()
                .filter(inv -> inv.getStatus() == InvoiceStatus.EXPIRED)
                .map(Invoice::getAdminNoticeMessageId)
                .filter(Objects::nonNull)
                .toList();
        if (!notices.isEmpty()) {
            // Deleted after this transaction commits, never inside it.
            appEvents.publishEvent(new InvoiceNoticeEvents.InvoicesExpired(notices));
        }
        log.info("Expired {} invoice(s)", expired);
    }
}
