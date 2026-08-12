package uz.efbazaar.payment.health;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminUserbotStatusControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;

    @Test
    void aPlainUserIsForbidden() throws Exception {
        mvc.perform(get("/api/v1/admin/payments/userbot").with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    /**
     * The 403 above is enforced by the /api/v1/admin/** rule in the filter
     * chain, which would also answer 403 for a path no controller serves —
     * so this reaches the endpoint as an admin to prove the refusal above is
     * authorization and not a missing mapping. Asserts only timeoutSeconds:
     * healthy/lastSeenAt depend on whatever heartbeats the shared
     * UserbotHealth singleton has seen in this context.
     */
    @Test
    void anAdminReadsTheStatus() throws Exception {
        mvc.perform(get("/api/v1/admin/payments/userbot").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeoutSeconds").value(180));
    }
}
