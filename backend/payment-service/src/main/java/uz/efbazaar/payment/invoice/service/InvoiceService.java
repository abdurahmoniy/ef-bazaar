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
import uz.efbazaar.payment.notify.AdminTelegramNotifier;
import uz.efbazaar.payment.notify.InvoiceNotice;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InvoiceService {

    private final SlotAllocator allocator;
    private final InvoiceRepository invoices;
    private final PlatformCardService cards;
    private final UserbotHealth userbot;
    private final AdminTelegramNotifier notifier;

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
        // A PENDING row whose expiresAt has already passed is not an unfinished
        // request -- it is one the sweeper has not reached yet, and the sweep
        // interval is 30s. Telling that user "you have an unfinished top-up"
        // contradicts the screen, which just told them the countdown ran out,
        // and leaves them with no action to take. The row is deliberately NOT
        // superseded here: it still holds its (card, amount) slot, and freeing
        // that slot early could hand the same amount to a new invoice while a
        // late transfer for the old one is still in flight.
        Optional<Invoice> pending = invoices.findByUserIdAndStatus(userId, InvoiceStatus.PENDING);
        if (pending.isPresent()) {
            boolean awaitingSweep = !pending.get().getExpiresAt().isAfter(Instant.now());
            throw new ResponseStatusException(HttpStatus.CONFLICT, awaitingSweep
                    ? "Oldingi so'rovingiz yopilmoqda — bir necha soniyadan keyin urinib ko'ring"
                    : "Sizda tugallanmagan to'ldirish bor");
        }

        Invoice inv = allocator.allocate(userId, requestedUzs * 100);
        announce(inv);
        return render(inv);
    }

    /**
     * Best effort by construction: {@link AdminTelegramNotifier} never throws,
     * and a missing message id simply means this invoice has no announcement to
     * delete later.
     *
     * <p>{@code create} is deliberately not {@code @Transactional} — the
     * allocator opens its own transaction per attempt — so this HTTP call holds
     * no database connection.
     */
    private void announce(Invoice inv) {
        PlatformCard card = cards.findById(inv.getCardId()).orElse(null);
        if (card == null) return;
        OptionalLong messageId = notifier.invoiceCreated(new InvoiceNotice(
                inv.getId(), inv.getUserId(), card.getLast4(), card.getHolderName(),
                inv.getRequestedAmountTiyin(), inv.getTransferAmountTiyin(),
                inv.getExpiresAt(), null));
        if (messageId.isPresent()) {
            inv.setAdminNoticeMessageId(messageId.getAsLong());
            invoices.save(inv);
        }
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

    /**
     * Claims an invoice for the observation that funded it.
     *
     * <p>Conditional, not a status check followed by a full-row save. The check
     * used to run against the caller's in-memory snapshot, which is exactly the
     * thing that can be stale: two observations naming the same slot both read
     * PENDING, both pass, and the second blind-writes the row — no double
     * credit, because the ledger's {@code invoice-<id>} key stops that, but a
     * second real payment recorded as MATCHED against an invoice it never
     * funded. And the expiry sweeper landing last wiped {@code paid_at} the same
     * way. Letting the database test the status makes the invariant independent
     * of how many consumers happen to be running.
     *
     * @return true if this call took the invoice; false if somebody else already
     *         had it, in which case the caller must NOT treat the payment as
     *         matched
     */
    @Transactional
    public boolean markPaid(Invoice invoice, UUID observationId) {
        return invoices.markPaidIfPending(invoice.getId(), Instant.now(), observationId) == 1;
    }

    private InvoiceResponse render(Invoice inv) {
        PlatformCard card = cards.findById(inv.getCardId())
                .orElseThrow(() -> new IllegalStateException(
                        "Invoice " + inv.getId() + " points at a missing card"));
        String expiry = "%02d/%02d".formatted(card.getExpiryMonth(), card.getExpiryYear() % 100);
        return InvoiceResponse.of(inv, cards.revealPan(card), card.getHolderName(), expiry);
    }
}
