package uz.efbazaar.trade.mail;

import jakarta.servlet.Filter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractPostgresIT;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Auth-boundary tests for MailController. IMAP connectivity is out of scope
 * here — those paths need a live dovecot (or GreenMail wired in a follow-up).
 * What we verify:
 * <ul>
 *   <li>anonymous → 401</li>
 *   <li>authenticated, no mailboxes → 200 with []</li>
 *   <li>authenticated user requesting <em>another</em> user's mailbox → 404
 *       (never 200 with their inbox)</li>
 * </ul>
 */
@SpringBootTest
class MailControllerIT extends AbstractPostgresIT {

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
    void anonymousMailboxesReturns401() throws Exception {
        mvc.perform(get("/api/v1/mail/mailboxes"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void anonymousInboxReturns401() throws Exception {
        mvc.perform(get("/api/v1/mail/" + UUID.randomUUID() + "/inbox"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void mailboxesWithNoOwnedReturnsEmptyList() throws Exception {
        UUID user = UUID.randomUUID();
        mvc.perform(get("/api/v1/mail/mailboxes")
                        .header("X-User-Id", user.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void inboxForOtherUsersMailboxReturns404() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        var mbox = mailboxService.create(uniqueEmail("inbox-others"), owner, UUID.randomUUID(),
                "pw".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/mail/" + mbox.getId() + "/inbox")
                        .header("X-User-Id", stranger.toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    void messageForOtherUsersMailboxReturns404() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        var mbox = mailboxService.create(uniqueEmail("msg-others"), owner, UUID.randomUUID(),
                "pw".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/mail/" + mbox.getId() + "/messages/1")
                        .header("X-User-Id", stranger.toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    void attachmentForOtherUsersMailboxReturns404() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        var mbox = mailboxService.create(uniqueEmail("att-others"), owner, UUID.randomUUID(),
                "pw".getBytes(StandardCharsets.UTF_8));

        mvc.perform(get("/api/v1/mail/" + mbox.getId() + "/messages/1/attachments/1")
                        .header("X-User-Id", stranger.toString()))
                .andExpect(status().isNotFound());
    }

    /**
     * mailboxes.email has a UNIQUE constraint; hardcoded addresses collide with
     * data left by earlier runs when this test class is re-executed inside the
     * same Testcontainers Postgres instance (Surefire fork reuse in CI).
     * Suffix a fresh UUID so each test's mailbox is unique.
     */
    private static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@efbazaar.uz";
    }

    @Test
    void anonymousMarkReadReturns401() throws Exception {
        mvc.perform(post("/api/v1/mail/" + UUID.randomUUID() + "/messages/1/read"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void markReadForOtherUsersMailboxReturns404() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        var mbox = mailboxService.create(uniqueEmail("read-others"), owner, UUID.randomUUID(),
                "pw".getBytes(StandardCharsets.UTF_8));

        mvc.perform(post("/api/v1/mail/" + mbox.getId() + "/messages/1/read")
                        .header("X-User-Id", stranger.toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    void inboxForMissingMailboxReturns404() throws Exception {
        UUID user = UUID.randomUUID();
        mvc.perform(get("/api/v1/mail/" + UUID.randomUUID() + "/inbox")
                        .header("X-User-Id", user.toString()))
                .andExpect(status().isNotFound());
    }
}
