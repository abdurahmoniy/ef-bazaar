package uz.efbazaar.payment.invoice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;

import java.time.Instant;
import java.util.List;

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

    @Scheduled(fixedDelayString = "${payment.scheduler.expiry-sweep-interval-ms:30000}")
    @Transactional
    public void sweep() {
        List<Invoice> due = invoices.findDue(Instant.now());
        if (due.isEmpty()) {
            return;
        }
        for (Invoice inv : due) {
            inv.setStatus(InvoiceStatus.EXPIRED);
        }
        invoices.saveAll(due);
        log.info("Expired {} invoice(s)", due.size());
    }
}
