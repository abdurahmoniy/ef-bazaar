package uz.efbazaar.trade.mailbox.link;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.kafka.TradeEvents.ImapPurpose;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository;
import uz.efbazaar.trade.plan.repository.UserPlanViewRepository;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/** Linking a Konami account to a mailbox: email change, then forgot-password as proof. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(StubEscrowConfig.class)
class LinkSessionIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MailboxRepository mailboxes;
    @Autowired LinkSessionService sessions;
    @Autowired TradeCrypto crypto;
    @Autowired JdbcTemplate jdbc;
    @Autowired TradeService trades;
    @Autowired PlanProjection projection;
    @Autowired PlanEntitlementViewRepository entitlementRows;
    @Autowired UserPlanViewRepository userPlanRows;
    @MockBean TradeEventPublisher events;

    /** Custom boxes fail closed without an entitlement; give everyone room unless a test says otherwise. */
    @org.junit.jupiter.api.BeforeEach
    void roomForEveryone() {
        Map<String, String> g = new HashMap<>();
        g.put("mailbox.slots", "10");
        g.put("mailbox.custom_slots", "10");
        projection.replacePlan("STANDARD", g);
    }

    @AfterEach
    void forget() {
        entitlementRows.deleteAll();
        userPlanRows.deleteAll();
    }

    private Mailbox box(UUID owner, MailboxKind kind, boolean provisioned) {
        UUID id = UUID.randomUUID();
        EncryptedField pw = crypto.encrypt("mbox-" + id, "s3cret".getBytes());
        return mailboxes.saveAndFlush(Mailbox.builder().id(id)
                .email("l" + Long.toString(System.nanoTime(), 36) + "@efbazaar.uz")
                .ownerUserId(owner).kind(kind)
                .encryptedPassword(pw.ciphertext()).passwordIv(pw.iv()).passwordTag(pw.tag())
                .createdAt(Instant.now()).provisionedAt(provisioned ? Instant.now() : null).build());
    }

    private ResultActions open(UUID owner, UUID mailboxId, UUID accountId, boolean emailAlreadySet) throws Exception {
        return mvc.perform(post("/api/v1/mailboxes/{id}/link-sessions", mailboxId).with(asUser(owner))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"accountId\":\"" + accountId + "\",\"emailAlreadySet\":" + emailAlreadySet + "}"));
    }

    private UUID openOk(UUID owner, UUID mailboxId, UUID accountId, boolean emailAlreadySet) throws Exception {
        String body = open(owner, mailboxId, accountId, emailAlreadySet)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(body).get("id").asText());
    }

    private JsonNode state(UUID owner, UUID sid) throws Exception {
        return json.readTree(mvc.perform(get("/api/v1/mailboxes/link-sessions/{sid}", sid).with(asUser(owner)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private static TradeEvents.PollCredentials credsFor(Mailbox mb) {
        return argThat(c -> c != null && ("mbox-" + mb.getId()).equals(c.passwordContext()));
    }

    @Test
    void newBoxStartsWithEmailChangeAndWatchesForTheCode() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), false);

        JsonNode s = state(owner, sid);
        assertThat(s.get("state").asText()).isEqualTo("WAIT_EMAIL_CHANGE");
        assertThat(s.get("email").asText()).isEqualTo(mb.getEmail());
        Instant deadline = Instant.parse(s.get("stepDeadline").asText());
        assertThat(Duration.between(Instant.now(), deadline)).isBetween(Duration.ofMinutes(14), Duration.ofMinutes(16));
        verify(events).imapPollRequest(eq(sid), eq(mb.getEmail()), eq(ImapPurpose.WAIT_EMAIL_CHANGE_CODE),
                eq(true), credsFor(mb));
    }

    @Test
    void alreadySetEmailGoesStraightToReset() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.RANDOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), true);

        assertThat(state(owner, sid).get("state").asText()).isEqualTo("WAIT_RESET");
        verify(events).imapPollRequest(eq(sid), eq(mb.getEmail()), eq(ImapPurpose.VERIFY_LINK), eq(true), credsFor(mb));
    }

    @Test
    void refusals() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        openOk(owner, mb.getId(), UUID.randomUUID(), false);
        open(owner, mb.getId(), UUID.randomUUID(), false)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("session_live"));

        open(UUID.randomUUID(), mb.getId(), UUID.randomUUID(), false).andExpect(status().isNotFound());

        Mailbox pending = box(owner, MailboxKind.CUSTOM, false);
        open(owner, pending.getId(), UUID.randomUUID(), false)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("mailbox_pending"));

        Mailbox linked = box(owner, MailboxKind.CUSTOM, true);
        jdbc.update("UPDATE mailboxes SET linked_account_id = ? WHERE id = ?", UUID.randomUUID(), linked.getId());
        open(owner, linked.getId(), UUID.randomUUID(), false)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("mailbox_linked"));
    }

    @Test
    void lockedBoxIsRefused() throws Exception {
        Map<String, String> g = new HashMap<>();
        g.put("mailbox.slots", "5");
        g.put("mailbox.custom_slots", "0");
        projection.replacePlan("STANDARD", g);
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);

        open(owner, mb.getId(), UUID.randomUUID(), false)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("mailbox_locked"));
    }

    @Test
    void randomBoxInALiveTradeIsRefused() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.RANDOM, true);
        var trade = trades.openTrade(UUID.randomUUID(), owner, UUID.randomUUID(), 500_000L, null, null,
                UUID.randomUUID(), null, TradeMode.SMART, null, null, TradeKind.SALE, 500_000L);
        jdbc.update("UPDATE trades SET mailbox_id = ? WHERE id = ?", mb.getId(), trade.id());

        open(owner, mb.getId(), UUID.randomUUID(), true)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("mailbox_in_trade"));
    }

    @Test
    void emailChangedMovesToResetOnlyFromTheEmailStep() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), false);

        mvc.perform(post("/api/v1/mailboxes/link-sessions/{sid}/email-changed", sid).with(asUser(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("WAIT_RESET"));
        verify(events).imapPollRequest(eq(sid), eq(mb.getEmail()), eq(ImapPurpose.VERIFY_LINK), eq(true), credsFor(mb));

        mvc.perform(post("/api/v1/mailboxes/link-sessions/{sid}/email-changed", sid).with(asUser(owner)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("invalid_state"));
    }

    @Test
    void resetMailVerifiesAndLinksTheBox() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID account = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), account, true);

        sessions.onResetMail(sid, false);

        assertThat(state(owner, sid).get("state").asText()).isEqualTo("VERIFIED");
        assertThat(mailboxes.findById(mb.getId()).orElseThrow().getLinkedAccountId()).isEqualTo(account);
        verify(events).imapPollStopRequest(mb.getEmail());
    }

    @Test
    void notRegisteredSendsTheUserBackToTheEmailStep() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), true);
        clearInvocations(events);

        sessions.onResetMail(sid, true);

        JsonNode s = state(owner, sid);
        assertThat(s.get("state").asText()).isEqualTo("WAIT_EMAIL_CHANGE");
        assertThat(s.get("notRegistered").asBoolean()).isTrue();
        verify(events).imapPollRequest(eq(sid), eq(mb.getEmail()), eq(ImapPurpose.WAIT_EMAIL_CHANGE_CODE),
                eq(true), credsFor(mb));
    }

    @Test
    void keepsTheNewestEmailChangeCode() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), false);
        Instant t = Instant.now();

        sessions.onEmailChangeCode(sid, "123456", t);
        sessions.onEmailChangeCode(sid, "999999", t.minusSeconds(30));

        assertThat(state(owner, sid).get("emailChangeCode").asText()).isEqualTo("123456");
    }

    @Test
    void expiresAndRetriesTheStepItExpiredIn() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), true);
        jdbc.update("UPDATE mailbox_link_sessions SET step_deadline = now() - interval '1 minute' WHERE id = ?", sid);

        sessions.expireDue(Instant.now());

        assertThat(state(owner, sid).get("state").asText()).isEqualTo("EXPIRED");
        verify(events).imapPollStopRequest(mb.getEmail());
        clearInvocations(events);

        mvc.perform(post("/api/v1/mailboxes/link-sessions/{sid}/retry", sid).with(asUser(owner)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("WAIT_RESET"));
        verify(events).imapPollRequest(eq(sid), eq(mb.getEmail()), eq(ImapPurpose.VERIFY_LINK), eq(true), credsFor(mb));
    }

    @Test
    void cancelStopsWatchingAndLeavesTheBoxAlone() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), false);

        mvc.perform(delete("/api/v1/mailboxes/link-sessions/{sid}", sid).with(asUser(owner)))
                .andExpect(status().isNoContent());

        assertThat(state(owner, sid).get("state").asText()).isEqualTo("CANCELLED");
        verify(events).imapPollStopRequest(mb.getEmail());
        assertThat(mailboxes.findById(mb.getId()).orElseThrow().getLinkedAccountId()).isNull();

        sessions.onResetMail(sid, false);
        assertThat(state(owner, sid).get("state").asText()).isEqualTo("CANCELLED");
    }

    @Test
    void otherUsersCannotSeeOrDriveTheSession() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), false);
        UUID stranger = UUID.randomUUID();

        mvc.perform(get("/api/v1/mailboxes/link-sessions/{sid}", sid).with(asUser(stranger)))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/mailboxes/link-sessions/{sid}", sid).with(asUser(stranger)))
                .andExpect(status().isNotFound());
        verify(events, never()).imapPollStopRequest(any());
    }

    @Test
    void customListShowsTheLiveSession() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM, true);
        UUID sid = openOk(owner, mb.getId(), UUID.randomUUID(), false);

        mvc.perform(get("/api/v1/mailboxes/custom").with(asUser(owner)))
                .andExpect(jsonPath("$[0].activeSessionId").value(sid.toString()));
    }
}
