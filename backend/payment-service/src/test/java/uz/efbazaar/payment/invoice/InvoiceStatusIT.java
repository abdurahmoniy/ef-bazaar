package uz.efbazaar.payment.invoice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.SlotAllocator;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * The read the wallet page polls while it waits for a transfer.
 *
 * <p>Two things are under test and both are the point of having a separate
 * endpoint at all: it never carries the card number, and it never answers about
 * somebody else's invoice.
 */
@SpringBootTest
@AutoConfigureMockMvc
class InvoiceStatusIT extends AbstractPostgresIT {

    private static final String PAN = "9860160101080101";

    @Autowired MockMvc mvc;
    @Autowired SlotAllocator allocator;
    @Autowired InvoiceRepository invoices;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired CardCreditObservationRepository observations;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        observations.deleteAll();
        invoices.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(),
                new PlatformCardCreateRequest(PAN, "AZIZ", (short) 12, (short) 2030));
    }

    private void markStatus(UUID invoiceId, String status) {
        jdbc.update("UPDATE invoices SET status = ? WHERE id = ?", status, invoiceId);
    }

    @Test
    void aPendingInvoiceReportsPendingAndNothingCredited() throws Exception {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);

        mvc.perform(get("/api/v1/payments/invoices/{id}/status", inv.getId()).with(asUser(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.creditedTiyin").doesNotExist());
    }

    @Test
    void aPaidInvoiceReportsWhatReachedTheWallet() throws Exception {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        // Straight SQL rather than the repository's @Modifying query: those
        // flush automatically and need a transaction the test is not in. The
        // column is what the endpoint reads either way.
        markStatus(inv.getId(), "PAID");

        mvc.perform(get("/api/v1/payments/invoices/{id}/status", inv.getId()).with(asUser(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                // The requested amount, not the transfer amount: a bump is the
                // platform's disambiguation charge, not the user's deposit.
                .andExpect(jsonPath("$.creditedTiyin").value(10_000_000));
    }

    /**
     * The reason this is not just {@code /active}. That endpoint decrypts the
     * PAN to build its response, and a page polling every four seconds would
     * put the platform's card number on the wire a few hundred times per
     * deposit for a question that never needed it.
     */
    @Test
    void theStatusReadNeverCarriesTheCardNumber() throws Exception {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);

        mvc.perform(get("/api/v1/payments/invoices/{id}/status", inv.getId()).with(asUser(user)))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(PAN))))
                .andExpect(jsonPath("$.pan").doesNotExist())
                .andExpect(jsonPath("$.holderName").doesNotExist());
    }

    /**
     * 404, not 403. A 403 would confirm the id exists, and an invoice id is the
     * only thing between a guess and knowing somebody is mid-deposit.
     */
    @Test
    void somebodyElsesInvoiceIsNotFoundRatherThanForbidden() throws Exception {
        Invoice inv = allocator.allocate(UUID.randomUUID(), 10_000_000);

        mvc.perform(get("/api/v1/payments/invoices/{id}/status", inv.getId())
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isNotFound());
    }

    @Test
    void anInvoiceThatNeverExistedIsAlsoNotFound() throws Exception {
        mvc.perform(get("/api/v1/payments/invoices/{id}/status", UUID.randomUUID())
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isNotFound());
    }

    @Test
    void anAnonymousCallerGetsNothing() throws Exception {
        Invoice inv = allocator.allocate(UUID.randomUUID(), 10_000_000);

        mvc.perform(get("/api/v1/payments/invoices/{id}/status", inv.getId()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anExpiredInvoiceReportsExpired() throws Exception {
        UUID user = UUID.randomUUID();
        Invoice inv = allocator.allocate(user, 10_000_000);
        markStatus(inv.getId(), "EXPIRED");

        mvc.perform(get("/api/v1/payments/invoices/{id}/status", inv.getId()).with(asUser(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EXPIRED"))
                .andExpect(jsonPath("$.creditedTiyin").doesNotExist());
    }
}
