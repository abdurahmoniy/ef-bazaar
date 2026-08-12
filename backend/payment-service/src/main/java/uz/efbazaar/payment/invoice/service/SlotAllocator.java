package uz.efbazaar.payment.invoice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.domain.PaymentProviderId;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Picks the {@code (card, transfer amount)} slot an invoice occupies.
 *
 * <p>The insert IS the allocation. Nothing is read to find a free slot first,
 * because a read-then-write loses the race whenever two users request the same
 * amount at the same moment; {@code uk_invoices_live_slot} decides the winner
 * instead, and a constraint violation is ordinary control flow here.
 *
 * <p>Each attempt runs in its own transaction: in PostgreSQL a constraint
 * violation marks the enclosing transaction rollback-only, so a retry inside
 * the same transaction cannot succeed. This class is deliberately NOT
 * {@code @Transactional} for the same reason.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SlotAllocator {

    private final PlatformCardService cards;
    private final InvoiceRepository invoices;
    private final PlatformTransactionManager txManager;

    @Value("${payment.deposit.invoice-ttl-minutes}") private long ttlMinutes;
    @Value("${payment.deposit.bump-step-uzs}")       private long bumpStepUzs;
    @Value("${payment.deposit.max-bump-uzs}")        private long maxBumpUzs;

    public Invoice allocate(UUID userId, long requestedTiyin) {
        List<PlatformCard> active = cards.activeOrdered();
        if (active.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Hozircha to'ldirish uchun karta yo'q");
        }

        TransactionTemplate tx = new TransactionTemplate(txManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        long stepTiyin = bumpStepUzs * 100;
        long maxBumpTiyin = maxBumpUzs * 100;

        for (long bump = 0; bump <= maxBumpTiyin; bump += stepTiyin) {
            long transfer = requestedTiyin + bump;
            for (PlatformCard card : active) {
                Invoice claimed = tryClaim(tx, userId, card.getId(), requestedTiyin, transfer);
                if (claimed != null) {
                    return claimed;
                }
            }
        }

        // Every card is busy at every amount within the ceiling. At realistic
        // volumes that means something is wrong, not that we are popular.
        log.warn("Slot exhausted for user {} at {} tiyin across {} cards",
                userId, requestedTiyin, active.size());
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Hozir band — bir necha daqiqadan keyin qayta urinib ko'ring");
    }

    private Invoice tryClaim(TransactionTemplate tx, UUID userId, UUID cardId,
                             long requestedTiyin, long transferTiyin) {
        try {
            return tx.execute(status -> {
                Invoice inv = Invoice.builder()
                        .id(UUID.randomUUID())
                        .userId(userId)
                        .provider(PaymentProviderId.BY_CARD)
                        .cardId(cardId)
                        .requestedAmountTiyin(requestedTiyin)
                        .transferAmountTiyin(transferTiyin)
                        .status(InvoiceStatus.PENDING)
                        .expiresAt(Instant.now().plus(Duration.ofMinutes(ttlMinutes)))
                        .createdAt(Instant.now())
                        .build();
                invoices.saveAndFlush(inv);
                return inv;
            });
        } catch (DataIntegrityViolationException e) {
            // Either this slot is taken, or the user already has a live
            // invoice. The caller checks the latter first, so treat it as
            // "slot busy" and move on.
            return null;
        }
    }
}
