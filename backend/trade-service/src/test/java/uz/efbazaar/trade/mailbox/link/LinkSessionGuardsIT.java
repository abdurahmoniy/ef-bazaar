package uz.efbazaar.trade.mailbox.link;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.kafka.KonamiEmailReceivedConsumer;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.kafka.TradeEvents.ImapPurpose;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.testsupport.AbstractMailboxFeatureIT;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/** One box, one account; the box's current owner is the only one who drives it. */
class LinkSessionGuardsIT extends AbstractMailboxFeatureIT {

    @Autowired MockMvc mvc;
    @Autowired LinkSessionService sessions;
    @Autowired MailboxLinkSessionRepository sessionRows;
    @Autowired MailboxRepository mailboxes;
    @Autowired MailboxService mailboxService;
    @Autowired KonamiEmailReceivedConsumer resetConsumer;
    @Autowired TradeCrypto crypto;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlanProjection projection;
    @Autowired PlanEntitlementViewRepository entitlementRows;

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

    private Mailbox box(UUID owner, MailboxKind kind) {
        UUID id = UUID.randomUUID();
        EncryptedField pw = crypto.encrypt("mbox-" + id, "s3cret".getBytes());
        return mailboxes.saveAndFlush(Mailbox.builder().id(id)
                .email("g" + Long.toString(System.nanoTime(), 36) + "@efbazaar.uz")
                .ownerUserId(owner).kind(kind)
                .encryptedPassword(pw.ciphertext()).passwordIv(pw.iv()).passwordTag(pw.tag())
                .createdAt(Instant.now()).provisionedAt(Instant.now()).build());
    }

    private LinkSessionState stateOf(UUID sid) {
        return sessionRows.findById(sid).orElseThrow().getState();
    }

    private UUID linkedOf(Mailbox mb) {
        return mailboxes.findById(mb.getId()).orElseThrow().getLinkedAccountId();
    }

    private void expire(UUID sid) {
        jdbc.update("UPDATE mailbox_link_sessions SET step_deadline = now() - interval '1 minute' WHERE id = ?", sid);
        sessions.expireDue(Instant.now());
    }

    @Test
    void retryIsRefusedOnceTheBoxBelongsToAnotherAccount() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM);
        UUID first = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();
        expire(first);
        UUID accountB = UUID.randomUUID();
        UUID second = sessions.open(owner, mb.getId(), accountB, true).getId();
        sessions.onResetMail(second, false);

        mvc.perform(post("/api/v1/mailboxes/link-sessions/{sid}/retry", first).with(asUser(owner)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("mailbox_linked"));
        assertThat(linkedOf(mb)).isEqualTo(accountB);
    }

    @Test
    void aResetMailNeverOverwritesAnotherAccountsLink() {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();
        UUID other = UUID.randomUUID();
        jdbc.update("UPDATE mailboxes SET linked_account_id = ? WHERE id = ?", other, mb.getId());

        sessions.onResetMail(sid, false);

        assertThat(stateOf(sid)).isEqualTo(LinkSessionState.CANCELLED);
        assertThat(linkedOf(mb)).isEqualTo(other);
        verify(events, never()).accountEmailVerified(any());
    }

    @Test
    void republishIsRefusedWhenTheBoxNoLongerHoldsThatAccount() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();
        sessions.onResetMail(sid, false);
        jdbc.update("UPDATE mailboxes SET linked_account_id = NULL WHERE id = ?", mb.getId());
        clearInvocations(events);

        mvc.perform(post("/api/v1/mailboxes/link-sessions/{sid}/republish", sid).with(asUser(owner)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("invalid_state"));
        verify(events, never()).accountEmailVerified(any());
    }

    @Test
    void aResetMailFromBeforeTheStepIsIgnoredAndWatchingRestarts() {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();
        clearInvocations(events);

        resetConsumer.onKonamiEmail(new TradeEvents.KonamiEmailReceived(UUID.randomUUID(), true,
                "noreply@konami.net", Instant.now().minusSeconds(3600), mb.getEmail(), false));

        assertThat(stateOf(sid)).isEqualTo(LinkSessionState.WAIT_RESET);
        verify(events).imapPollRequest(eq(sid), eq(mb.getEmail()), eq(ImapPurpose.VERIFY_LINK), eq(true), any());

        resetConsumer.onKonamiEmail(new TradeEvents.KonamiEmailReceived(UUID.randomUUID(), true,
                "noreply@konami.net", Instant.now(), mb.getEmail(), false));
        assertThat(stateOf(sid)).isEqualTo(LinkSessionState.VERIFIED);
    }

    @Test
    void detachingARandomBoxEndsItsSessionAndLink() {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.RANDOM);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();
        jdbc.update("UPDATE mailboxes SET linked_account_id = ? WHERE id = ?", UUID.randomUUID(), mb.getId());
        clearInvocations(events);

        mailboxService.detachOwnedBy(owner, mb.getId());

        assertThat(stateOf(sid)).isEqualTo(LinkSessionState.CANCELLED);
        assertThat(linkedOf(mb)).isNull();
        verify(events).imapPollStopRequest(mb.getEmail());
    }

    @Test
    void reassigningABoxLocksThePreviousOwnerOut() throws Exception {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.RANDOM);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), false).getId();
        sessions.onEmailChangeCode(sid, "123456", Instant.now());
        UUID newOwner = UUID.randomUUID();

        mailboxService.reassignOwner(UUID.randomUUID(), mb.getId(), newOwner);

        assertThat(stateOf(sid)).isEqualTo(LinkSessionState.CANCELLED);
        mvc.perform(get("/api/v1/mailboxes/link-sessions/{sid}", sid).with(asUser(owner)))
                .andExpect(status().isNotFound());
        assertThat(sessions.liveSessionFor(mb.getEmail())).isEmpty();
    }

    @Test
    void aSessionWhoseOwnerLostTheBoxDoesNotReceiveItsMail() {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM);
        UUID sid = sessions.open(owner, mb.getId(), UUID.randomUUID(), true).getId();
        // Ownership moved by a path that does not end sessions (e.g. a manual fix).
        jdbc.update("UPDATE mailboxes SET owner_user_id = ? WHERE id = ?", UUID.randomUUID(), mb.getId());

        assertThat(sessions.liveSessionFor(mb.getEmail())).isEmpty();
        sessions.onResetMail(sid, false);
        assertThat(stateOf(sid)).isEqualTo(LinkSessionState.CANCELLED);
        assertThat(linkedOf(mb)).isNull();
    }

    @Test
    void aCustomBoxCannotBeReleasedByItsOwner() {
        UUID owner = UUID.randomUUID();
        Mailbox mb = box(owner, MailboxKind.CUSTOM);

        assertThatThrownBy(() -> mailboxService.detachOwnedBy(owner, mb.getId()))
                .isInstanceOf(uz.efbazaar.trade.common.exception.ApiCodeException.class)
                .extracting("code").isEqualTo("custom_mailbox_permanent");
        assertThat(mailboxes.findById(mb.getId()).orElseThrow().getOwnerUserId()).isEqualTo(owner);
    }
}
