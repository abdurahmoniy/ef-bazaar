package uz.efbazaar.payment.observation;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.observation.domain.CardCreditObservation;
import uz.efbazaar.payment.observation.domain.ObservationStatus;
import uz.efbazaar.payment.observation.dto.IgnoreObservationRequest;
import uz.efbazaar.payment.observation.dto.ResolveObservationRequest;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.repository.WalletTransactionRepository;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminObservationControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ByCardService byCard;
    @Autowired LedgerService ledger;
    @Autowired CardCreditObservationRepository observations;
    @Autowired InvoiceRepository invoices;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired WalletTransactionRepository transactions;

    @BeforeEach
    void clean() {
        observations.deleteAll();
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ", (short) 12, (short) 2030));
    }

    /**
     * {@code card_credit_observations.invoice_id} has an FK to {@code invoices}
     * and every other IT in this module opens with {@code invoices.deleteAll()}
     * against the same shared container, so a leftover matched observation breaks
     * whichever class runs next. Here the risk is only latent — {@link #queued}
     * deliberately matches no invoice, so {@code invoice_id} stays null — but the
     * convention is kept so the first matching observation added to this class
     * does not have to rediscover the rule.
     */
    @AfterEach
    void leaveNoObservationsBehind() {
        observations.deleteAll();
    }

    /** An observation with no invoice behind it — the queue's whole subject. */
    private CardCreditObservation queued(long amountTiyin) {
        return byCard.ingest(new CardCreditEvent(
                System.nanoTime(), "0101", amountTiyin, 3_165_916L,
                Instant.now(), "🎉 To'ldirish\n➕ ... UZS"));
    }

    @Test
    void aPlainUserIsForbidden() throws Exception {
        mvc.perform(get("/api/v1/admin/payments/observations/unmatched")
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void theQueueShowsWhatTheAdminNeedsToDecide() throws Exception {
        var obs = queued(7_777_777);
        assertThat(obs.getStatus()).isEqualTo(ObservationStatus.UNMATCHED);
        String id = obs.getId().toString();
        String sel = "$[?(@.id=='" + id + "')]";

        mvc.perform(get("/api/v1/admin/payments/observations/unmatched").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath(sel).exists())
                .andExpect(jsonPath(sel + ".amountTiyin").value(org.hamcrest.Matchers.hasItem(7777777)))
                .andExpect(jsonPath(sel + ".cardLast4").value(org.hamcrest.Matchers.hasItem("0101")))
                .andExpect(jsonPath(sel + ".rawText").exists());
    }

    /** The point of a queue is that it shrinks as the admin works it. */
    @Test
    void aResolvedObservationLeavesTheQueue() throws Exception {
        var obs = queued(7_777_777);
        String sel = "$[?(@.id=='" + obs.getId() + "')]";

        mvc.perform(get("/api/v1/admin/payments/observations/unmatched").with(asAdmin()))
                .andExpect(jsonPath(sel).exists());

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new ResolveObservationRequest(
                                UUID.randomUUID(), "navbatdan chiqsin"))))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/admin/payments/observations/unmatched").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath(sel).doesNotExist());
    }

    @Test
    void resolvingCreditsTheNamedUserTheAmountThatArrived() throws Exception {
        var obs = queued(7_777_777);
        UUID target = UUID.randomUUID();

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                new ResolveObservationRequest(target, "Telegram orqali tasdiqlandi"))))
                .andExpect(status().isOk());

        assertThat(ledger.balanceOf(target).getAvailableTiyin()).isEqualTo(7_777_777);
        assertThat(observations.findById(obs.getId()).orElseThrow().getStatus())
                .isEqualTo(ObservationStatus.MANUALLY_RESOLVED);
    }

    @Test
    void resolvingWithoutANoteIsRefused() throws Exception {
        var obs = queued(7_777_777);

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                new ResolveObservationRequest(UUID.randomUUID(), "  "))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void thesameObservationCannotBeResolvedTwice() throws Exception {
        var obs = queued(7_777_777);
        UUID target = UUID.randomUUID();
        String body = json.writeValueAsString(
                new ResolveObservationRequest(target, "birinchi marta"));

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());

        assertThat(ledger.balanceOf(target).getAvailableTiyin())
                .as("a double resolve must not double credit")
                .isEqualTo(7_777_777);
    }

    @Test
    void ignoringDismissesTheCreditWithoutMovingAnyMoney() throws Exception {
        var obs = queued(7_777_777);
        UUID bystander = UUID.randomUUID();
        long transactionsBefore = transactions.count();

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/ignore", obs.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                new IgnoreObservationRequest("boshqa kartaga tegishli"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IGNORED"));

        assertThat(observations.findById(obs.getId()).orElseThrow().getStatus())
                .isEqualTo(ObservationStatus.IGNORED);
        assertThat(transactions.count())
                .as("dismissing a credit must post nothing to the ledger")
                .isEqualTo(transactionsBefore);
        assertThat(ledger.balanceOf(bystander).getAvailableTiyin()).isZero();
    }

    @Test
    void anAlreadyResolvedObservationCannotBeIgnored() throws Exception {
        var obs = queued(7_777_777);

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/resolve", obs.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new ResolveObservationRequest(
                                UUID.randomUUID(), "allaqachon biriktirildi"))))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/ignore", obs.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new IgnoreObservationRequest("baribir"))))
                .andExpect(status().isConflict());

        assertThat(observations.findById(obs.getId()).orElseThrow().getStatus())
                .isEqualTo(ObservationStatus.MANUALLY_RESOLVED);
    }

    /** The ignore note is optional on purpose — dismissing creates no money. */
    @Test
    void ignoringWithNoBodyAtAllSucceeds() throws Exception {
        var obs = queued(7_777_777);

        mvc.perform(post("/api/v1/admin/payments/observations/{id}/ignore", obs.getId())
                        .with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IGNORED"));

        assertThat(observations.findById(obs.getId()).orElseThrow().getResolutionNote()).isNull();
    }
}
