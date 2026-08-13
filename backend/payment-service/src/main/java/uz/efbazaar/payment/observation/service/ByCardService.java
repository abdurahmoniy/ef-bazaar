package uz.efbazaar.payment.observation.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.kafka.PaymentEventPublisher;
import uz.efbazaar.payment.notify.InvoiceNoticeEvents;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Turns an observed card credit into a wallet credit — or into an admin's
 * problem, which is the safer default.
 *
 * <p>The whole design rests on one rule: a credit happens only when the
 * observation names EXACTLY ONE live invoice. Zero candidates and several
 * candidates are both refusals. An expired invoice is not a candidate at all,
 * because its slot has been released and may already belong to a different
 * user's live invoice — crediting on amount alone would credit the wrong
 * person.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ByCardService {

    private final CardCreditObservationRepository observations;
    private final PlatformCardService cards;
    private final InvoiceService invoices;
    private final LedgerService ledger;
    private final PaymentEventPublisher events;
    /** Named apart from {@code events} above — that one is the Kafka publisher. */
    private final ApplicationEventPublisher appEvents;

    public record CardCreditEvent(
            Long telegramMessageId,
            String cardLast4,
            Long amountTiyin,
            Long cardBalanceTiyin,
            Instant observedAt,
            String rawText) {}

    @Transactional
    public CardCreditObservation ingest(CardCreditEvent event) {
        Optional<CardCreditObservation> seen =
                observations.findByTelegramMessageId(event.telegramMessageId());
        if (seen.isPresent()) {
            log.debug("Telegram message {} already ingested", event.telegramMessageId());
            return seen.get();
        }

        CardCreditObservation obs = CardCreditObservation.builder()
                .id(UUID.randomUUID())
                .telegramMessageId(event.telegramMessageId())
                .cardLast4(event.cardLast4())
                .amountTiyin(event.amountTiyin())
                .cardBalanceTiyin(event.cardBalanceTiyin())
                .observedAt(event.observedAt())
                .rawText(event.rawText())
                .status(ObservationStatus.UNMATCHED)
                .createdAt(Instant.now())
                .build();

        Optional<PlatformCard> card = cards.findActiveByLast4(event.cardLast4());
        if (card.isEmpty()) {
            // Not our card. Nothing to reconcile and nothing to credit.
            obs.setStatus(ObservationStatus.IGNORED);
            obs.setResolutionNote("Bu karta platformaga tegishli emas");
            return observations.save(obs);
        }

        if (event.cardBalanceTiyin() != null) {
            cards.recordBalance(card.get().getId(), event.cardBalanceTiyin(), event.observedAt());
        }

        List<Invoice> candidates = invoices.findLive(
                card.get().getId(), event.amountTiyin(), event.observedAt());

        if (candidates.size() != 1) {
            log.warn("Observation {} matched {} invoices on card *{} at {} tiyin — queued",
                    obs.getId(), candidates.size(), event.cardLast4(), event.amountTiyin());
            return observations.save(obs);
        }

        Invoice invoice = candidates.get(0);
        credit(invoice, obs);
        obs.setStatus(ObservationStatus.MATCHED);
        obs.setInvoiceId(invoice.getId());
        return observations.save(obs);
    }

    /**
     * An admin attributes a queued observation to a user by hand. The credited
     * amount is what actually arrived — there is no invoice to take a requested
     * amount from.
     */
    @Transactional
    public CardCreditObservation resolveManually(UUID observationId, UUID targetUserId,
                                                 UUID adminId, String note) {
        CardCreditObservation obs = require(observationId);
        if (obs.getStatus() != ObservationStatus.UNMATCHED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu tushum allaqachon hal qilingan: " + obs.getStatus());
        }
        if (note == null || note.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Izoh majburiy — nima uchun biriktirilgani yozilishi kerak");
        }

        ledger.post(TransactionKind.ADJUSTMENT, "obs-manual-" + obs.getId(), adminId, note,
                List.of(new Posting(LedgerAccount.PLATFORM_CARDS, null, obs.getAmountTiyin()),
                        new Posting(LedgerAccount.USER_AVAILABLE, targetUserId,
                                -obs.getAmountTiyin())));

        obs.setStatus(ObservationStatus.MANUALLY_RESOLVED);
        obs.setResolvedBy(adminId);
        obs.setResolvedAt(Instant.now());
        obs.setResolutionNote(note);
        return observations.save(obs);
    }

    @Transactional
    public CardCreditObservation markIgnored(UUID observationId, UUID adminId, String note) {
        CardCreditObservation obs = require(observationId);
        if (obs.getStatus() != ObservationStatus.UNMATCHED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu tushum allaqachon hal qilingan: " + obs.getStatus());
        }
        obs.setStatus(ObservationStatus.IGNORED);
        obs.setResolvedBy(adminId);
        obs.setResolvedAt(Instant.now());
        obs.setResolutionNote(note);
        return observations.save(obs);
    }

    @Transactional(readOnly = true)
    public List<CardCreditObservation> unmatched() {
        return observations.findByStatusOrderByObservedAtAsc(ObservationStatus.UNMATCHED);
    }

    private void credit(Invoice invoice, CardCreditObservation obs) {
        long transferred = invoice.getTransferAmountTiyin();
        long credited = invoice.getRequestedAmountTiyin();
        long bump = transferred - credited;

        List<Posting> postings = new ArrayList<>();
        postings.add(new Posting(LedgerAccount.PLATFORM_CARDS, null, transferred));
        postings.add(new Posting(LedgerAccount.USER_AVAILABLE, invoice.getUserId(), -credited));
        if (bump > 0) {
            // Omitted when zero: chk_entry_non_zero rejects a zero entry.
            postings.add(new Posting(LedgerAccount.PLATFORM_REVENUE, null, -bump));
        }

        ledger.post(TransactionKind.DEPOSIT, "invoice-" + invoice.getId(), null, null, postings);
        // markPaid before the observation is saved is safe on purpose:
        // invoices.observation_id is a plain UUID column with no REFERENCES,
        // because the two tables point at each other and one side has to stay
        // unconstrained.
        invoices.markPaid(invoice, obs.getId());
        events.depositCredited(invoice.getUserId(), credited, invoice.getId());
        // Announced after this transaction commits, never inside it: a notice
        // posted before a rollback would advertise a payment that never
        // happened, and a Telegram round trip here would hold a database
        // connection for its duration. See InvoiceNoticeListener.
        appEvents.publishEvent(new InvoiceNoticeEvents.InvoicePaid(invoice.getId()));
    }

    private CardCreditObservation require(UUID id) {
        return observations.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Tushum topilmadi"));
    }
}
