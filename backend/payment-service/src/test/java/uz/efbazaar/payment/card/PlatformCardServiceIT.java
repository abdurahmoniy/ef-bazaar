package uz.efbazaar.payment.card;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.domain.CardAuditAction;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class PlatformCardServiceIT extends AbstractPostgresIT {

    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository repo;
    @Autowired PlatformCardAuditRepository audits;
    @Autowired InvoiceRepository invoices;

    // Luhn-valid Humo test PANs (BIN 9860). Each digit sum below is verified
    // divisible by 10; last4 stays as annotated for the assertions that key on it.
    private static final String HUMO_A = "9860160101080101"; // last4 0101
    private static final String HUMO_B = "9860160102050202"; // last4 0202

    /**
     * Children before parents. Invoices reference platform_cards, and the
     * invoice ITs leave their rows behind — so under a run order that puts
     * them first, deleting cards without clearing invoices trips
     * invoices_card_id_fkey. Cleaning up here rather than teaching every
     * invoice IT to tidy after itself keeps this class independent of what
     * ran before it, which is the property that makes a reversed run order
     * worth running at all.
     */
    @BeforeEach
    void clean() {
        invoices.deleteAll();
        audits.deleteAll();
        repo.deleteAll();
    }

    private PlatformCardCreateRequest req(String pan, String holder) {
        return new PlatformCardCreateRequest(pan, holder, (short) 12, (short) 2030);
    }

    @Test
    void creatingACardStoresItAndUpperCasesTheHolder() {
        UUID admin = UUID.randomUUID();

        var card = cards.create(admin, req(HUMO_A, "aziz karimov"));

        assertThat(card.getLast4()).isEqualTo("0101");
        assertThat(card.getHolderName()).isEqualTo("AZIZ KARIMOV");
        assertThat(card.isActive()).isTrue();
        assertThat(card.getDisplayOrder()).isEqualTo(1);
        assertThat(card.getBalanceTiyin()).isNull();
    }

    @Test
    void aSecondActiveCardCannotShareTheLastFourDigits() {
        UUID admin = UUID.randomUUID();
        cards.create(admin, req(HUMO_A, "AZIZ"));

        // Different full number, same trailing four (also Luhn-valid).
        assertThatThrownBy(() -> cards.create(admin, req("9860160199920101", "BOBUR")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void aDeactivatedCardReleasesItsLastFourDigits() {
        UUID admin = UUID.randomUUID();
        var first = cards.create(admin, req(HUMO_A, "AZIZ"));
        cards.deactivate(admin, first.getId());

        var second = cards.create(admin, req("9860160199920101", "BOBUR"));
        assertThat(second.getLast4()).isEqualTo("0101");
    }

    @Test
    void anInvalidCardNumberIsRefused() {
        UUID admin = UUID.randomUUID();

        // Deliberately Luhn-invalid (last digit off by one from a valid PAN) --
        // this is the negative case the test means to exercise, not a typo.
        assertThatThrownBy(() -> cards.create(admin, req("9860160101010102", "AZIZ")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void activeOrderedWalksTheDisplayOrderAndSkipsInactiveCards() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        var b = cards.create(admin, req(HUMO_B, "BOBUR"));
        var c = cards.create(admin, req("9860160103020303", "DILSHOD"));
        cards.deactivate(admin, b.getId());

        assertThat(cards.activeOrdered())
                .extracting(x -> x.getId())
                .containsExactly(a.getId(), c.getId());
    }

    @Test
    void reorderingRewritesTheOrder() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        var b = cards.create(admin, req(HUMO_B, "BOBUR"));

        cards.reorder(admin, List.of(b.getId(), a.getId()));

        assertThat(cards.activeOrdered())
                .extracting(x -> x.getId())
                .containsExactly(b.getId(), a.getId());
    }

    @Test
    void reorderOmittingAnActiveCardIsRejectedAndLeavesTheStoredOrderUnchanged() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        var b = cards.create(admin, req(HUMO_B, "BOBUR"));

        assertThatThrownBy(() -> cards.reorder(admin, List.of(a.getId())))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");

        assertThat(cards.activeOrdered())
                .extracting(x -> x.getId())
                .containsExactly(a.getId(), b.getId());
    }

    @Test
    void reorderNamingTheSameCardTwiceIsRejectedAndLeavesTheStoredOrderUnchanged() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        var b = cards.create(admin, req(HUMO_B, "BOBUR"));

        assertThatThrownBy(() -> cards.reorder(admin, List.of(a.getId(), a.getId())))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");

        assertThat(cards.activeOrdered())
                .extracting(x -> x.getId())
                .containsExactly(a.getId(), b.getId());
    }

    @Test
    void reorderNamingAnUnknownCardIsRejectedAndLeavesTheStoredOrderUnchanged() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        var b = cards.create(admin, req(HUMO_B, "BOBUR"));

        assertThatThrownBy(() -> cards.reorder(admin, List.of(a.getId(), UUID.randomUUID())))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");

        assertThat(cards.activeOrdered())
                .extracting(x -> x.getId())
                .containsExactly(a.getId(), b.getId());
    }

    @Test
    void aPanWithNoKnownBinIsRefused() {
        UUID admin = UUID.randomUUID();

        // Luhn-valid but no BIN rule in CardBrand.detect matches "6011" (Discover).
        assertThatThrownBy(() -> cards.create(admin, req("6011000000000004", "AZIZ")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown card brand");
    }

    @Test
    void everyMutationIsAudited() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        cards.deactivate(admin, a.getId());
        cards.activate(admin, a.getId());

        assertThat(audits.findAll())
                .extracting(x -> x.getAction())
                .contains(CardAuditAction.CREATED,
                          CardAuditAction.DEACTIVATED,
                          CardAuditAction.ACTIVATED);
        assertThat(audits.findAll())
                .allSatisfy(x -> assertThat(x.getActorId()).isEqualTo(admin));
    }

    @Test
    void recordingABalanceStampsWhenItWasObserved() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        Instant seen = Instant.now();

        cards.recordBalance(a.getId(), 3_165_916, seen);

        var reloaded = repo.findById(a.getId()).orElseThrow();
        assertThat(reloaded.getBalanceTiyin()).isEqualTo(3_165_916);
        assertThat(reloaded.getBalanceObservedAt()).isNotNull();
    }

    @Test
    void findActiveByLast4IgnoresDeactivatedCards() {
        UUID admin = UUID.randomUUID();
        var a = cards.create(admin, req(HUMO_A, "AZIZ"));
        assertThat(cards.findActiveByLast4("0101")).isPresent();

        cards.deactivate(admin, a.getId());
        assertThat(cards.findActiveByLast4("0101")).isEmpty();
    }
}
