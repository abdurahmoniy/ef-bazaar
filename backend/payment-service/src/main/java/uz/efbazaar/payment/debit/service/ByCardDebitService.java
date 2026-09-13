package uz.efbazaar.payment.debit.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.debit.domain.CardDebitObservation;
import uz.efbazaar.payment.debit.repository.CardDebitObservationRepository;
import uz.efbazaar.payment.notify.InvoiceNoticeEvents;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Records money leaving a platform card and tells the admin topic about it.
 *
 * <p><b>This service never posts to the ledger, and that is deliberate.</b>
 * {@code WithdrawalService.markPaid} already writes {@code PLATFORM_CARDS
 * −amount} when an admin closes a payout ticket. A second posting from here
 * would debit the platform twice for one payout and drive the cards account
 * steadily negative — silently, because both postings balance on their own.
 *
 * <p>What it does instead is record the bank's version of events. The finance
 * dashboard compares the ledger's card balance against the observed one; that
 * comparison is the only check in the whole rail that can actually fail, and
 * without these rows the observed side went stale the moment a payout left.
 *
 * <p>Matching a debit to an open withdrawal ticket is deliberately NOT done.
 * Two users can be owed the same round number on the same day, and closing the
 * wrong person's ticket pays one user and tells the other their money is gone,
 * with no screen able to undo it. The admin closes the ticket; this only makes
 * sure they can see the movement.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ByCardDebitService {

    private final CardDebitObservationRepository debits;
    private final PlatformCardService cards;
    private final ApplicationEventPublisher appEvents;

    public record CardDebitEvent(
            Long telegramMessageId,
            String cardLast4,
            Long amountTiyin,
            Long commissionTiyin,
            Long cardBalanceTiyin,
            String description,
            Instant observedAt,
            String rawText) {}

    @Transactional
    /**
     * @return the stored observation, or {@code null} when the card is not the
     *         platform's — in which case nothing at all is recorded
     */
    public CardDebitObservation ingest(CardDebitEvent event) {
        Optional<CardDebitObservation> seen =
                debits.findByTelegramMessageId(event.telegramMessageId());
        if (seen.isPresent()) {
            log.debug("Telegram message {} already ingested", event.telegramMessageId());
            return seen.get();
        }

        // A personal card of the account owner: not recorded at all. Its
        // balance, and where the owner sends their own money, are none of the
        // platform's business and must not sit in a table every admin can read.
        // A deactivated platform card is still ours — see findOwnedByLast4.
        Optional<PlatformCard> card = cards.findOwnedByLast4(event.cardLast4());
        if (card.isEmpty()) {
            log.debug("Debit on card *{} is not a platform card — not recorded",
                    event.cardLast4());
            return null;
        }

        CardDebitObservation obs = CardDebitObservation.builder()
                .id(UUID.randomUUID())
                .telegramMessageId(event.telegramMessageId())
                .cardId(card.get().getId())
                .cardLast4(event.cardLast4())
                .amountTiyin(event.amountTiyin())
                .commissionTiyin(event.commissionTiyin())
                .cardBalanceTiyin(event.cardBalanceTiyin())
                .description(event.description())
                .rawText(event.rawText())
                .observedAt(event.observedAt())
                .createdAt(Instant.now())
                .build();

        CardDebitObservation saved = debits.save(obs);

        if (event.cardBalanceTiyin() != null) {
            cards.recordBalance(card.get().getId(), event.cardBalanceTiyin(), event.observedAt());
        }

        // AFTER_COMMIT, like every other notice in this service: a Telegram
        // outage must cost a message, never the row that records where the
        // money went.
        appEvents.publishEvent(new InvoiceNoticeEvents.CardDebited(saved.getId()));
        return saved;
    }
}
