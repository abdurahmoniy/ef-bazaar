package uz.efbazaar.payment.card;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminPlatformCardControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired PlatformCardRepository repo;
    @Autowired PlatformCardAuditRepository audits;
    @Autowired InvoiceRepository invoices;

    /** Children before parents — see the note on PlatformCardServiceIT.clean(). */
    @BeforeEach
    void clean() {
        invoices.deleteAll();
        audits.deleteAll();
        repo.deleteAll();
    }

    @Test
    void aPlainUserIsForbidden() throws Exception {
        mvc.perform(get("/api/v1/admin/payments/cards").with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void anAdminCreatesAndListsACardWithoutEverSeeingTheFullNumber() throws Exception {
        var req = new PlatformCardCreateRequest(
                "9860 1601 0108 0101", "aziz karimov", (short) 12, (short) 2030);

        mvc.perform(post("/api/v1/admin/payments/cards")
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.last4").value("0101"))
                .andExpect(jsonPath("$.holderName").value("AZIZ KARIMOV"))
                .andExpect(jsonPath("$.brand").value("HUMO"))
                .andExpect(jsonPath("$.maskedPan").value("**** **** **** 0101"))
                .andExpect(jsonPath("$.panEncrypted").doesNotExist());

        mvc.perform(get("/api/v1/admin/payments/cards").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].last4").value("0101"))
                .andExpect(jsonPath("$[0].active").value(true));
    }

    @Test
    void aMalformedCardNumberIsRejectedAtTheBoundary() throws Exception {
        var req = new PlatformCardCreateRequest("1234", "AZIZ", (short) 12, (short) 2030);

        mvc.perform(post("/api/v1/admin/payments/cards")
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }
}
