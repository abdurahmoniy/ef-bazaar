package uz.efbazaar.payment.debit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.debit.domain.CardDebitObservation;
import uz.efbazaar.payment.debit.repository.CardDebitObservationRepository;
import uz.efbazaar.payment.debit.service.ByCardDebitService;
import uz.efbazaar.payment.debit.service.ByCardDebitService.CardDebitEvent;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Ingesting money that LEFT a platform card.
 *
 * <p>The assertion that matters most in this file is the one that checks the
 * ledger did NOT move. {@code WithdrawalService.markPaid} already debits
 * {@code PLATFORM_CARDS} when an admin closes a payout, so a posting from this
 * side would take the money out twice — and both postings balance on their own,
 * so nothing would raise. The cards account would just drift down, quietly, one
 * payout at a time.
 */
@SpringBootTest
class ByCardDebitServiceIT extends AbstractPostgresIT {

    private static final Instant OBSERVED_AT = Instant.parse("2026-09-10T20:34:00Z");

    @Autowired ByCardDebitService debits;
    @Autowired CardDebitObservationRepository repo;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired uz.efbazaar.payment.invoice.repository.InvoiceRepository invoices;
    @Autowired uz.efbazaar.payment.observation.repository.CardCreditObservationRepository
            creditObservations;
    @Autowired JdbcTemplate jdbc;

    /**
     * Children before parents. The Postgres container is shared across every IT
     * in this module, so cards left behind by another class may still be
     * referenced by its invoices and credit observations — deleting the cards
     * first fails on {@code invoices_card_id_fkey}, and which class it breaks
     * depends on run order.
     */
    @BeforeEach
    void clean() {
        creditObservations.deleteAll();
        invoices.deleteAll();
        repo.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        jdbc.update("DELETE FROM ledger_entries");
        jdbc.update("DELETE FROM wallet_transactions");
    }

    private PlatformCard ourCard() {
        return cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));
    }

    private CardDebitEvent event(long messageId, String last4, long amountTiyin) {
        return new CardDebitEvent(messageId, last4, amountTiyin, 0L, 4_400_000L,
                "Openbank P2P HUMO OT", OBSERVED_AT, "💸 Amaliyot ➖ 10.000,00 UZS");
    }

    @Test
    void aDebitOnOurCardIsRecordedWholeAndTheBalanceIsUpdated() {
        PlatformCard card = ourCard();

        CardDebitObservation obs = debits.ingest(event(88_001L, card.getLast4(), 1_000_000L));

        assertThat(obs.getCardId()).isEqualTo(card.getId());
        assertThat(obs.getAmountTiyin()).isEqualTo(1_000_000L);
        assertThat(obs.getCommissionTiyin()).isZero();
        assertThat(obs.getDescription()).isEqualTo("Openbank P2P HUMO OT");
        assertThat(obs.getObservedAt()).isEqualTo(OBSERVED_AT);

        PlatformCard fresh = cardRepo.findById(card.getId()).orElseThrow();
        assertThat(fresh.getBalanceTiyin()).isEqualTo(4_400_000L);
        assertThat(fresh.getBalanceObservedAt()).isEqualTo(OBSERVED_AT);
    }

    /**
     * The whole reason this service exists as an observer and not a bookkeeper.
     * A payout is already posted by WithdrawalService; posting again here would
     * debit the platform twice for one payout, silently.
     */
    @Test
    void aDebitPostsNothingToTheLedger() {
        PlatformCard card = ourCard();

        debits.ingest(event(88_002L, card.getLast4(), 1_000_000L));

        Long entries = jdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries", Long.class);
        assertThat(entries).as("an observation is a record, not a posting").isZero();

        Long cardsAccount = jdbc.queryForObject(
                "SELECT coalesce(sum(amount_tiyin), 0) FROM ledger_entries WHERE account = ?",
                Long.class, LedgerAccount.PLATFORM_CARDS.name());
        assertThat(cardsAccount).isZero();
    }

    /** A Kafka redelivery must not record the same movement twice. */
    @Test
    void theSameTelegramMessageIsIngestedOnlyOnce() {
        PlatformCard card = ourCard();

        CardDebitObservation first = debits.ingest(event(88_003L, card.getLast4(), 1_000_000L));
        CardDebitObservation again = debits.ingest(event(88_003L, card.getLast4(), 1_000_000L));

        assertThat(again.getId()).isEqualTo(first.getId());
        assertThat(repo.count()).isEqualTo(1);
    }

    /**
     * Somebody else's card. The row is still kept — a movement we cannot
     * explain is worth having on record — but no card balance is touched.
     */
    @Test
    void aDebitOnACardWeDoNotOwnIsRecordedWithNoCard() {
        ourCard();

        CardDebitObservation obs = debits.ingest(event(88_004L, "9999", 500_000L));

        assertThat(obs.getCardId()).isNull();
        assertThat(obs.getCardLast4()).isEqualTo("9999");
        assertThat(repo.count()).isEqualTo(1);
    }

    /**
     * The bank omits these lines on some notices. Null must survive as null:
     * a commission of zero is a statement the bank made, and "no line" is not.
     */
    @Test
    void anAbsentCommissionAndBalanceStayNull() {
        PlatformCard card = ourCard();

        CardDebitObservation obs = debits.ingest(new CardDebitEvent(
                88_005L, card.getLast4(), 402_000L, null, null, null,
                OBSERVED_AT, "💸 Amaliyot"));

        assertThat(obs.getCommissionTiyin()).isNull();
        assertThat(obs.getCardBalanceTiyin()).isNull();
        assertThat(cardRepo.findById(card.getId()).orElseThrow().getBalanceTiyin())
                .as("no balance in the notice means no balance to record")
                .isNull();
    }

    /** The card is now part of the payment record and cannot be deleted away. */
    @Test
    void aCardWithADebitAgainstItCanNoLongerBeDeleted() {
        PlatformCard card = ourCard();
        debits.ingest(event(88_006L, card.getLast4(), 1_000_000L));

        org.assertj.core.api.Assertions
                .assertThatThrownBy(() -> cards.delete(UUID.randomUUID(), card.getId()))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("faolsizlantiring");
    }
}
