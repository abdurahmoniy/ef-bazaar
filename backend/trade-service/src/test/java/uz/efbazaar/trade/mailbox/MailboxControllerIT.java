package uz.efbazaar.trade.mailbox;

import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractPostgresIT;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.UUID;

import static org.hamcrest.Matchers.equalTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
class MailboxControllerIT extends AbstractPostgresIT {

    private static Path masterKeyFile;

    @DynamicPropertySource
    static void setupMasterKey(DynamicPropertyRegistry registry) throws IOException {
        byte[] key = new byte[32];
        new java.security.SecureRandom().nextBytes(key);
        masterKeyFile = Files.createTempFile("trade-master-key-", ".txt");
        Files.writeString(masterKeyFile, Base64.getEncoder().encodeToString(key));
        registry.add("trade.crypto.master-key-file", () -> masterKeyFile.toString());
    }

    @Autowired
    private WebApplicationContext ctx;

    @Autowired
    private MailboxService mailboxService;

    @Autowired
    @Qualifier("springSecurityFilterChain")
    private Filter springSecurityFilterChain;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(ctx)
                .addFilters(springSecurityFilterChain)
                .build();
    }

    @Test
    void anonymousCallReturns401() throws Exception {
        mvc.perform(get("/api/v1/mailboxes"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void listReturnsOwnedMailboxes() throws Exception {
        UUID user = UUID.randomUUID();
        mailboxService.create("tX7kpb2m@efbazaar.uz", user, UUID.randomUUID(),
                "supersecret".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/mailboxes").header("X-User-Id", user.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()", equalTo(1)))
                .andExpect(jsonPath("$[0].email", equalTo("tX7kpb2m@efbazaar.uz")))
                .andExpect(jsonPath("$[0].encryptedPassword").doesNotExist());
    }

    @Test
    void getReturnsOwnedMailboxById() throws Exception {
        UUID owner = UUID.randomUUID();
        var mbox = mailboxService.create("owned@efbazaar.uz", owner, UUID.randomUUID(),
                "pw".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/mailboxes/" + mbox.getId())
                        .header("X-User-Id", owner.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email", equalTo("owned@efbazaar.uz")))
                .andExpect(jsonPath("$.encryptedPassword").doesNotExist());
    }
    // Note: cross-user access ("stranger can't fetch owner's mailbox") is covered below.

    @Test
    void getRejectsOtherUsersMailboxWith404() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        var mbox = mailboxService.create("private@efbazaar.uz", owner, UUID.randomUUID(),
                "pw".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/mailboxes/" + mbox.getId())
                        .header("X-User-Id", stranger.toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", equalTo("not_found")));
    }

    @Test
    void adminCanListOrphaned() throws Exception {
        mvc.perform(get("/api/v1/admin/mailboxes/orphaned")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Roles", "ROLE_USER,ROLE_ADMIN"))
                .andExpect(status().isOk());
    }

    @Test
    void nonAdminIsForbidden() throws Exception {
        mvc.perform(get("/api/v1/admin/mailboxes/orphaned")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Roles", "ROLE_USER"))
                .andExpect(status().isForbidden());
    }
}
