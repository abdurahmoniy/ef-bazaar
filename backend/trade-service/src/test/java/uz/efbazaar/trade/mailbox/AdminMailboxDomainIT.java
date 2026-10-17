package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin;

/** Admins open mailboxes on any configured domain; the worker is told which one. */
class AdminMailboxDomainIT extends uz.efbazaar.trade.testsupport.AbstractMailboxFeatureIT {

    @Autowired MockMvc mvc;
    @Autowired uz.efbazaar.trade.mailbox.repository.MailboxRepository mailboxes;

    private String body(String localPart, String domain) {
        String d = domain == null ? "" : ",\"domain\":\"" + domain + "\"";
        return "{\"localPart\":\"" + localPart + "\",\"ownerUserId\":\"" + UUID.randomUUID() + "\"" + d + "}";
    }

    @Test
    void createsOnChosenDomain() throws Exception {
        String local = "promo" + System.nanoTime() % 100000;
        mvc.perform(post("/api/v1/admin/mailboxes").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content(body(local, "efootball.uz")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value(local + "@efootball.uz"));
        verify(events).mailboxProvisionRequest(any(), eq(local), eq("efootball.uz"));
        // A box an admin hands to someone is that person's own address, not a trade box.
        assertThat(mailboxes.findByEmail(local + "@efootball.uz").orElseThrow().getKind())
                .isEqualTo(uz.efbazaar.trade.mailbox.domain.MailboxKind.CUSTOM);
    }

    @Test
    void defaultsToFirstDomain() throws Exception {
        String local = "plain" + System.nanoTime() % 100000;
        mvc.perform(post("/api/v1/admin/mailboxes").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content(body(local, null)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value(local + "@efbazaar.uz"));
        verify(events).mailboxProvisionRequest(any(), eq(local), eq("efbazaar.uz"));
    }

    @Test
    void refusesUnknownDomain() throws Exception {
        mvc.perform(post("/api/v1/admin/mailboxes").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content(body("promo2", "gmail.com")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("domain_not_allowed"));
    }

    @Test
    void listsDomains() throws Exception {
        mvc.perform(get("/api/v1/admin/mailboxes/domains").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0]").value("efbazaar.uz"))
                .andExpect(jsonPath("$[1]").value("efootball.uz"));
    }
}
