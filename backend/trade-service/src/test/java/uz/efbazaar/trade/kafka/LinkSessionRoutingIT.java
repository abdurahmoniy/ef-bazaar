package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.link.LinkSessionService;
import uz.efbazaar.trade.mailbox.link.LinkSessionState;
import uz.efbazaar.trade.mailbox.link.MailboxLinkSession;
import uz.efbazaar.trade.mailbox.link.MailboxLinkSessionRepository;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/** Worker answers for a box with a live link session drive the session, not a trade. */
class LinkSessionRoutingIT extends uz.efbazaar.trade.testsupport.AbstractMailboxFeatureIT {

    @Autowired MockMvc mvc;
    @Autowired KonamiEmailReceivedConsumer resetConsumer;
    @Autowired KonamiEmailChangeCodeConsumer codeConsumer;
    @Autowired AccountEmailUnlinkedConsumer unlinkedConsumer;
    @Autowired LinkSessionService sessions;
    @Autowired MailboxLinkSessionRepository sessionRows;
    @Autowired MailboxRepository mailboxes;
    @Autowired TradeCrypto crypto;
    @Autowired PlanProjection projection;
    @Autowired PlanEntitlementViewRepository entitlementRows;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @BeforeEach
    void roomForEveryone() {
        Map<String, String> g = new HashMap<>();
        g.put("mailbox.slots", "10");
        g.put("mailbox.custom_slots", "10");
        projection.replacePlan("STANDARD", g);
    }

    @AfterEach
    void forget() {
        entitlementRows.deleteAll();
    }

    private Mailbox box(UUID owner) {
        UUID id = UUID.randomUUID();
        EncryptedField pw = crypto.encrypt("mbox-" + id, "s3cret".getBytes());
        return mailboxes.saveAndFlush(Mailbox.builder().id(id)
                .email("r" + Long.toString(System.nanoTime(), 36) + "@efbazaar.uz")
                .ownerUserId(owner).kind(MailboxKind.CUSTOM)
                .encryptedPassword(pw.ciphertext()).passwordIv(pw.iv()).passwordTag(pw.tag())
                .createdAt(Instant.now()).provisionedAt(Instant.now()).build());
    }

    private MailboxLinkSession reload(UUID sid) {
        return sessionRows.findById(sid).orElseThrow();
    }

    @Test
    void resetMailVerifiesTheSessionAndAnnouncesIt() {
        UUID owner = UUID.randomUUID();
        UUID account = UUID.randomUUID();
        Mailbox mb = box(owner);
        UUID sid = sessions.open(owner, mb.getId(), account, true).getId();

        resetConsumer.onKonamiEmail(new TradeEvents.KonamiEmailReceived(
                UUID.randomUUID(), true, "noreply@konami.net", Instant.now(), mb.getEmail(), false));

        assertThat(reload(sid).getState()).isEqualTo(LinkSessionState.VERIFIED);
        verify(events).accountEmailVerified(argThat(v -> v.sessionId().equals(sid)
                && v.accountId().equals(account) && v.ownerId().equals(owner)
                && v.mailboxId().equals(mb.getId()) && v.email().equals(mb.getEmail()) && v.custom()));
    }

    @Test
    void notRegisteredSendsTheSessionBack() {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();

        resetConsumer.onKonamiEmail(new TradeEvents.KonamiEmailReceived(
                UUID.randomUUID(), false, "noreply@konami.net", Instant.now(), mb.getEmail(), true));

        MailboxLinkSession s = reload(sid);
        assertThat(s.getState()).isEqualTo(LinkSessionState.WAIT_EMAIL_CHANGE);
        assertThat(s.isNotRegistered()).isTrue();
        verify(events, never()).accountEmailVerified(any());
    }

    @Test
    void mailWithoutResetLinkIsIgnored() {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();

        resetConsumer.onKonamiEmail(new TradeEvents.KonamiEmailReceived(
                UUID.randomUUID(), false, "noreply@konami.net", Instant.now(), mb.getEmail(), false));

        assertThat(reload(sid).getState()).isEqualTo(LinkSessionState.WAIT_RESET);
    }

    @Test
    void emailChangeCodeLandsOnTheSession() {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), false).getId();

        codeConsumer.onCode(new TradeEvents.KonamiEmailChangeCodeReceived(
                UUID.randomUUID(), "123456", Instant.now(), "noreply@konami.net", mb.getEmail()));

        assertThat(reload(sid).getEmailChangeCode()).isEqualTo("123456");
        verify(events, never()).tradeAction(any(), any(), any(), any(), org.mockito.ArgumentMatchers.anyLong(), any(), any(), any());
    }

    @Test
    void unlinkedFreesTheBoxOnlyForTheLinkedAccount() {
        UUID owner = UUID.randomUUID();
        UUID account = UUID.randomUUID();
        Mailbox mb = box(owner);
        jdbc.update("UPDATE mailboxes SET linked_account_id = ? WHERE id = ?", account, mb.getId());

        unlinkedConsumer.onUnlinked(new TradeEvents.AccountEmailUnlinked(
                UUID.randomUUID(), owner, mb.getId(), "EDITED", Instant.now()));
        assertThat(mailboxes.findById(mb.getId()).orElseThrow().getLinkedAccountId()).isEqualTo(account);

        unlinkedConsumer.onUnlinked(new TradeEvents.AccountEmailUnlinked(
                account, owner, mb.getId(), "SOLD", Instant.now()));
        unlinkedConsumer.onUnlinked(new TradeEvents.AccountEmailUnlinked(
                account, owner, mb.getId(), "SOLD", Instant.now()));
        assertThat(mailboxes.findById(mb.getId()).orElseThrow().getLinkedAccountId()).isNull();
    }

    @Test
    void republishResendsOnlyForVerifiedSessions() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();

        mvc.perform(post("/api/v1/mailboxes/link-sessions/{sid}/republish", sid).with(asUser(owner)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("invalid_state"));

        sessions.onResetMail(sid, false);
        clearInvocations(events);
        mvc.perform(post("/api/v1/mailboxes/link-sessions/{sid}/republish", sid).with(asUser(owner)))
                .andExpect(status().isNoContent());
        verify(events, times(1)).accountEmailVerified(argThat(v -> v.sessionId().equals(sid)));
    }
}
