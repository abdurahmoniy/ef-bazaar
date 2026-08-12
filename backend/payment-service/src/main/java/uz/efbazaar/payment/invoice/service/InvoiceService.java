package uz.efbazaar.payment.invoice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.health.UserbotHealth;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.dto.InvoiceResponse;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InvoiceService {

    private final SlotAllocator allocator;
    private final InvoiceRepository invoices;
    private final PlatformCardService cards;
    private final UserbotHealth userbot;

    @Value("${payment.deposit.minimum-uzs}") private long minimumUzs;

    public InvoiceResponse create(UUID userId, long requestedUzs) {
        // Refusing money we cannot observe is better than taking it blind.
        if (!userbot.isHealthy()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "To'ldirish vaqtincha ishlamayapti — birozdan keyin urinib ko'ring");
        }
        if (requestedUzs < minimumUzs) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Eng kam summa: " + minimumUzs + " so'm");
        }
        if (invoices.findByUserIdAndStatus(userId, InvoiceStatus.PENDING).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sizda tugallanmagan to'ldirish bor");
        }

        Invoice inv = allocator.allocate(userId, requestedUzs * 100);
        return render(inv);
    }

    @Transactional(readOnly = true)
    public Optional<InvoiceResponse> myActive(UUID userId) {
        return invoices.findByUserIdAndStatus(userId, InvoiceStatus.PENDING)
                .filter(i -> i.getExpiresAt().isAfter(Instant.now()))
                .map(this::render);
    }

    @Transactional(readOnly = true)
    public List<Invoice> findLive(UUID cardId, long transferTiyin, Instant at) {
        return invoices.findLiveSlot(cardId, transferTiyin, at);
    }

    @Transactional
    public void markPaid(Invoice invoice, UUID observationId) {
        if (invoice.getStatus() != InvoiceStatus.PENDING) {
            throw new IllegalStateException(
                    "Invoice " + invoice.getId() + " is " + invoice.getStatus());
        }
        invoice.setStatus(InvoiceStatus.PAID);
        invoice.setPaidAt(Instant.now());
        invoice.setObservationId(observationId);
        invoices.save(invoice);
    }

    private InvoiceResponse render(Invoice inv) {
        PlatformCard card = cards.findById(inv.getCardId())
                .orElseThrow(() -> new IllegalStateException(
                        "Invoice " + inv.getId() + " points at a missing card"));
        String expiry = "%02d/%02d".formatted(card.getExpiryMonth(), card.getExpiryYear() % 100);
        return InvoiceResponse.of(inv, cards.revealPan(card), card.getHolderName(), expiry);
    }
}
