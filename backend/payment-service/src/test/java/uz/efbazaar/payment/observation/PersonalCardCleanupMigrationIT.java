package uz.efbazaar.payment.observation;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.debit.domain.CardDebitObservation;
import uz.efbazaar.payment.debit.repository.CardDebitObservationRepository;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * V12 deletes production rows and cannot be undone, so what it deletes is
 * pinned here row by row.
 *
 * <p>Flyway has already run V12 against the empty test schema at startup. The
 * test therefore seeds the rows V12 was written for and executes the migration
 * file itself a second time — the script is plain DELETEs, so a re-run is safe
 * and tests exactly the SQL that ships.
 */
@SpringBootTest
class PersonalCardCleanupMigrationIT extends AbstractPostgresIT {

    private static final String SCRIPT = "db/migration/V12__drop_personal_card_observations.sql";
    private static final AtomicLong MSG = new AtomicLong(990_000);

    @Autowired DataSource dataSource;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired InvoiceRepository invoices;
    @Autowired CardCreditObservationRepository credits;
    @Autowired CardDebitObservationRepository debits;

    /** Children before parents: the Postgres container is shared with every IT. */
    @BeforeEach
    void clean() {
        credits.deleteAll();
        debits.deleteAll();
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
    }

    private void runMigration() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(c, new ClassPathResource(SCRIPT));
        }
    }

    private CardCreditObservation credit(String last4, ObservationStatus status, UUID resolvedBy) {
        return credits.save(CardCreditObservation.builder()
                .id(UUID.randomUUID())
                .telegramMessageId(MSG.getAndIncrement())
                .cardLast4(last4)
                .amountTiyin(100_000)
                .observedAt(Instant.now())
                .rawText("bank notice")
                .status(status)
                .resolvedBy(resolvedBy)
                .createdAt(Instant.now())
                .build());
    }

    private CardDebitObservation debit(String last4, UUID cardId) {
        return debits.save(CardDebitObservation.builder()
                .id(UUID.randomUUID())
                .telegramMessageId(MSG.getAndIncrement())
                .cardId(cardId)
                .cardLast4(last4)
                .amountTiyin(50_000)
                .rawText("bank notice")
                .observedAt(Instant.now())
                .createdAt(Instant.now())
                .build());
    }

    @Test
    void personalCardRowsAreDeleted() throws Exception {
        CardCreditObservation personalCredit = credit("9999", ObservationStatus.IGNORED, null);
        CardDebitObservation personalDebit = debit("9999", null);

        runMigration();

        assertThat(credits.findById(personalCredit.getId())).isEmpty();
        assertThat(debits.findById(personalDebit.getId())).isEmpty();
    }

    /**
     * A retired platform card is still the platform's: the old code filed its
     * credits as IGNORED and its debits with no card id, exactly like a stranger's.
     * Deleting those would erase real platform money.
     */
    @Test
    void rowsOnADeactivatedPlatformCardSurvive() throws Exception {
        PlatformCard card = cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));
        cards.deactivate(UUID.randomUUID(), card.getId());

        CardCreditObservation retiredCredit = credit("0101", ObservationStatus.IGNORED, null);
        CardDebitObservation retiredDebit = debit("0101", null);

        runMigration();

        assertThat(credits.findById(retiredCredit.getId())).isPresent();
        assertThat(debits.findById(retiredDebit.getId())).isPresent();
    }

    /** An admin's own decision to ignore a row is a record of that decision. */
    @Test
    void anAdminIgnoredRowSurvivesEvenOnAnUnknownCard() throws Exception {
        CardCreditObservation adminIgnored =
                credit("9999", ObservationStatus.IGNORED, UUID.randomUUID());

        runMigration();

        assertThat(credits.findById(adminIgnored.getId())).isPresent();
    }

    /** Only IGNORED rows are candidates; anything still awaiting a human stays. */
    @Test
    void anUnmatchedRowSurvives() throws Exception {
        CardCreditObservation unmatched = credit("9999", ObservationStatus.UNMATCHED, null);

        runMigration();

        assertThat(credits.findById(unmatched.getId())).isPresent();
    }

    @Test
    void rowsOnAnActivePlatformCardSurvive() throws Exception {
        PlatformCard card = cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));

        CardCreditObservation ours = credit("0101", ObservationStatus.MATCHED, null);
        CardDebitObservation ourDebit = debit("0101", card.getId());

        runMigration();

        assertThat(credits.findById(ours.getId())).isPresent();
        assertThat(debits.findById(ourDebit.getId())).isPresent();
    }
}
