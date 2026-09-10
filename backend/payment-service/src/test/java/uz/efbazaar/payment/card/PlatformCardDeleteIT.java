package uz.efbazaar.payment.card;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.CardAuditAction;
import uz.efbazaar.payment.card.domain.PlatformCard;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.domain.PaymentProviderId;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Deleting a platform card. The rule under test: a card is deletable only while
 * it is still just a number somebody typed. The moment real money references it
 * the delete must be refused, because the reference outlives the row.
 */
@SpringBootTest
class PlatformCardDeleteIT extends AbstractPostgresIT {

    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired InvoiceRepository invoices;
    @Autowired CardCreditObservationRepository observations;

    /** Children before parents: invoices carry a foreign key to platform_cards. */
    @BeforeEach
    void clean() {
        invoices.deleteAll();
        observations.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
    }

    private PlatformCard freshCard(String pan) {
        return cards.create(UUID.randomUUID(),
                new PlatformCardCreateRequest(pan, "aziz karimov", (short) 12, (short) 2030));
    }

    @Test
    void aCardNobodyEverPaidIsRemovedForGood() {
        PlatformCard card = freshCard("9860 1601 0108 0101");
        UUID admin = UUID.randomUUID();

        cards.delete(admin, card.getId());

        assertThat(cardRepo.findById(card.getId())).isEmpty();
    }

    @Test
    void theAuditLineOutlivesTheCardItNames() {
        PlatformCard card = freshCard("9860 1601 0108 0101");

        cards.delete(UUID.randomUUID(), card.getId());

        assertThat(auditRepo.findAll())
                .as("platform_card_audit.card_id has no foreign key, so history survives the delete")
                .anyMatch(a -> a.getCardId().equals(card.getId())
                        && a.getAction() == CardAuditAction.DELETED);
    }

    @Test
    void aCardAnInvoiceNamedIsRefusedRatherThanOrphaningThePayment() {
        PlatformCard card = freshCard("9860 1601 0108 0101");
        invoices.save(Invoice.builder()
                .id(UUID.randomUUID())
                .userId(UUID.randomUUID())
                .provider(PaymentProviderId.BY_CARD)
                .cardId(card.getId())
                .requestedAmountTiyin(100_000)
                .transferAmountTiyin(100_000)
                .status(InvoiceStatus.PAID)
                .expiresAt(Instant.now().plus(1, ChronoUnit.HOURS))
                .createdAt(Instant.now())
                .build());

        assertThatThrownBy(() -> cards.delete(UUID.randomUUID(), card.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("faolsizlantiring");

        assertThat(cardRepo.findById(card.getId())).isPresent();
    }

    /**
     * An observation names a card by its last four digits and nothing else, so
     * no foreign key would have stopped this one. Without the explicit check the
     * unmatched queue would hold credits pointing at a card that no longer
     * exists — and an admin resolving one has no way to see where the money
     * landed.
     */
    @Test
    void aCardTheUserbotSawMoneyLandOnIsRefusedToo() {
        PlatformCard card = freshCard("9860 1601 0108 0101");
        observations.save(CardCreditObservation.builder()
                .id(UUID.randomUUID())
                .telegramMessageId(4242L)
                .cardLast4(card.getLast4())
                .amountTiyin(250_000)
                .observedAt(Instant.now())
                .rawText("Popolnenie 2500.00 UZS")
                .status(ObservationStatus.UNMATCHED)
                .createdAt(Instant.now())
                .build());

        assertThatThrownBy(() -> cards.delete(UUID.randomUUID(), card.getId()))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(cardRepo.findById(card.getId())).isPresent();
    }

    @Test
    void deletingACardThatIsNotThereIsANotFound() {
        assertThatThrownBy(() -> cards.delete(UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("topilmadi");
    }
}
