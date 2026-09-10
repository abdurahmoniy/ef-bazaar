package uz.efbazaar.payment.history;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.payment.debit.domain.CardDebitObservation;
import uz.efbazaar.payment.debit.repository.CardDebitObservationRepository;
import uz.efbazaar.payment.history.dto.CardMovementResponse;
import uz.efbazaar.payment.history.dto.CardMovementResponse.Direction;
import uz.efbazaar.payment.history.service.CardHistoryService;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The card history: two tables read as one list.
 *
 * <p>The tables are separate for a safety reason — a debit must never reach the
 * credit reconciliation queue, where an admin could attribute it to a user and
 * create money — but "what happened on this card" is one question, and an admin
 * interleaving two lists by eye is how a movement gets missed.
 */
@SpringBootTest
class CardHistoryServiceIT extends AbstractPostgresIT {

    private static final Instant BASE = Instant.parse("2026-09-10T12:00:00Z");

    @Autowired CardHistoryService history;
    @Autowired CardCreditObservationRepository credits;
    @Autowired CardDebitObservationRepository debits;

    @BeforeEach
    void clean() {
        credits.deleteAll();
        debits.deleteAll();
    }

    private void credit(long messageId, String last4, long tiyin, int minutesAgo) {
        credits.save(CardCreditObservation.builder()
                .id(UUID.randomUUID())
                .telegramMessageId(messageId)
                .cardLast4(last4)
                .amountTiyin(tiyin)
                .observedAt(BASE.minus(minutesAgo, ChronoUnit.MINUTES))
                .rawText("🎉 To'ldirish")
                .status(ObservationStatus.MATCHED)
                .createdAt(Instant.now())
                .build());
    }

    private void debit(long messageId, String last4, long tiyin, int minutesAgo) {
        debits.save(CardDebitObservation.builder()
                .id(UUID.randomUUID())
                .telegramMessageId(messageId)
                .cardLast4(last4)
                .amountTiyin(tiyin)
                .description("Openbank P2P HUMO OT")
                .observedAt(BASE.minus(minutesAgo, ChronoUnit.MINUTES))
                .rawText("💸 Amaliyot")
                .createdAt(Instant.now())
                .build());
    }

    @Test
    void bothDirectionsArriveInOneListNewestFirst() {
        credit(1, "0101", 100_000, 30);
        debit(2, "0101", 50_000, 20);
        credit(3, "0101", 700_000, 10);

        List<CardMovementResponse> rows = history.recent(null, 0);

        assertThat(rows).extracting(CardMovementResponse::amountTiyin)
                .containsExactly(700_000L, 50_000L, 100_000L);
        assertThat(rows).extracting(CardMovementResponse::direction)
                .containsExactly(Direction.IN, Direction.OUT, Direction.IN);
    }

    /** The sign is the direction field, never the number. */
    @Test
    void aDebitAmountIsReportedPositive() {
        debit(1, "0101", 50_000, 1);

        CardMovementResponse row = history.recent(null, 0).get(0);

        assertThat(row.amountTiyin()).isPositive();
        assertThat(row.direction()).isEqualTo(Direction.OUT);
        assertThat(row.description()).isEqualTo("Openbank P2P HUMO OT");
    }

    @Test
    void aCreditCarriesItsReconciliationStatusAndADebitDoesNot() {
        credit(1, "0101", 100_000, 2);
        debit(2, "0101", 50_000, 1);

        List<CardMovementResponse> rows = history.recent(null, 0);

        assertThat(rows.get(0).creditStatus()).isNull();
        assertThat(rows.get(1).creditStatus()).isEqualTo("MATCHED");
    }

    @Test
    void filteringByCardKeepsOnlyThatCardsMovements() {
        credit(1, "0101", 100_000, 3);
        debit(2, "0202", 50_000, 2);
        debit(3, "0101", 70_000, 1);

        List<CardMovementResponse> rows = history.recent("0101", 0);

        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(CardMovementResponse::cardLast4)
                .containsOnly("0101");
    }

    /**
     * Each side is read at the full limit, not half. A day of nothing but
     * debits must still fill the page rather than returning half of one.
     */
    @Test
    void aPageOfOnlyDebitsIsStillAFullPage() {
        for (int i = 0; i < 8; i++) {
            debit(100 + i, "0101", 1_000 + i, i);
        }

        assertThat(history.recent(null, 5)).hasSize(5);
    }

    @Test
    void theLimitIsCappedSoOneRequestCannotPullEverything() {
        for (int i = 0; i < 3; i++) {
            credit(200 + i, "0101", 1_000, i);
        }

        // Asking for more than the cap is not an error — it is simply capped.
        assertThat(history.recent(null, 10_000))
                .hasSizeLessThanOrEqualTo(CardHistoryService.MAX_LIMIT);
    }

    /**
     * Two notices can share a second. Without a tie-break the order is whatever
     * the two lists happened to be concatenated in, and the same request
     * answers differently on consecutive calls.
     */
    @Test
    void movementsSharingASecondAreOrderedDeterministically() {
        credit(1, "0101", 100_000, 5);
        debit(2, "0101", 50_000, 5);

        List<UUID> first = history.recent(null, 0).stream()
                .map(CardMovementResponse::id).toList();
        List<UUID> second = history.recent(null, 0).stream()
                .map(CardMovementResponse::id).toList();

        assertThat(first).isEqualTo(second);
    }

    @Test
    void anEmptyHistoryIsAnEmptyListRatherThanAFailure() {
        assertThat(history.recent(null, 0)).isEmpty();
        assertThat(history.recent("0101", 0)).isEmpty();
    }
}
