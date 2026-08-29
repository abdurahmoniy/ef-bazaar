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
    /**
     * In-process only. Everything that leaves this service — the Kafka record
     * and the Telegram notice alike — is published as an application event here
     * and sent by an AFTER_COMMIT listener, so nothing is announced that a
     * rollback could still take back.
     */
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
            return queue(obs);
        }

        Invoice invoice = candidates.get(0);
        if (!credit(invoice, obs)) {
            // Somebody else took this invoice between our read and our write.
            // The observation stays UNMATCHED and goes to the admin queue:
            // recording it MATCHED would file a second real payment against an
            // invoice it never funded, which is how money disappears quietly.
            log.warn("Observation {} lost the race for invoice {} — queued",
                    obs.getId(), invoice.getId());
            return queue(obs);
        }
        obs.setStatus(ObservationStatus.MATCHED);
        obs.setInvoiceId(invoice.getId());
        return observations.save(obs);
    }

    /**
     * An admin attributes a queued observation to a user by hand. The credited
     * amount is what actually arrived — there is no invoice to take a requested
     * amount from.
     */
    /** Qo'lda hal qilinganlar — oxirgi 100 tasi, eng yangisidan. */
    @Transactional(readOnly = true)
    public List<CardCreditObservation> resolvedHistory() {
        return observations.findTop100ByResolvedAtIsNotNullOrderByResolvedAtDesc();
    }

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
        // Qabul qiluvchi qatorga yoziladi: ledger'ga bog'lovchi kalit
        // idempotency string ichida va u yerdan qaytib kelish yo'li yo'q.
        obs.setResolvedUserId(targetUserId);
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

    /**
     * @return false if another observation claimed this invoice first, in which
     *         case nothing was credited and the caller must queue instead
     */
    private boolean credit(Invoice invoice, CardCreditObservation obs) {
        // Claim first, credit second. markPaid is a conditional UPDATE, so its
        // row count is the one authority on who owns this invoice; doing it
        // before any money moves means a loser posts nothing at all rather than
        // relying on the ledger's idempotency key to undo it afterwards.
        //
        // Claiming before the observation row is saved is safe on purpose:
        // invoices.observation_id is a plain UUID column with no REFERENCES,
        // because the two tables point at each other and one side has to stay
        // unconstrained.
        if (!invoices.markPaid(invoice, obs.getId())) {
            return false;
        }

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

        // Both of these fire only after this transaction commits, never inside
        // it. A deposit-credited record on the wire before a rollback has a
        // downstream consumer announcing money that never arrived, and there is
        // no retraction to send afterwards — the same reason the Telegram notice
        // has always been AFTER_COMMIT. See InvoiceNoticeListener and
        // PaymentEventPublisher.
        appEvents.publishEvent(new PaymentEventPublisher.DepositCreditedSignal(
                invoice.getUserId(), credited, invoice.getId()));
        appEvents.publishEvent(new InvoiceNoticeEvents.InvoicePaid(invoice.getId()));
        return true;
    }

    /**
     * Locked, not a plain read: {@code resolveManually} and {@code markIgnored}
     * both decide on this row and one of them creates money that nothing can
     * take back. See {@code findByIdForUpdate}.
     */
    /**
     * Files a payment nobody claimed and tells the admin topic about it.
     *
     * <p>Both callers reach here with the observation still UNMATCHED, which is
     * the status it must keep. The announcement is AFTER_COMMIT like every
     * other notice, so a Telegram outage cannot roll back the row that records
     * the money — a missing message is recoverable, a missing observation is
     * a payment nobody can trace.
     */
    private CardCreditObservation queue(CardCreditObservation obs) {
        CardCreditObservation saved = observations.save(obs);
        appEvents.publishEvent(new InvoiceNoticeEvents.UnmatchedCredit(saved.getId()));
        return saved;
    }

    private CardCreditObservation require(UUID id) {
        return observations.findByIdForUpdate(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Tushum topilmadi"));
    }
}
