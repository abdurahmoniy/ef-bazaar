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
        // Collected before the save so the ids survive; the notices are deleted
        // after this transaction commits, never inside it.
        List<Long> notices = due.stream()
                .map(Invoice::getAdminNoticeMessageId)
                .filter(Objects::nonNull)
                .toList();
        for (Invoice inv : due) {
            inv.setStatus(InvoiceStatus.EXPIRED);
        }
        invoices.saveAll(due);
        if (!notices.isEmpty()) {
            appEvents.publishEvent(new InvoiceNoticeEvents.InvoicesExpired(notices));
        }
        log.info("Expired {} invoice(s)", due.size());
    }
}
