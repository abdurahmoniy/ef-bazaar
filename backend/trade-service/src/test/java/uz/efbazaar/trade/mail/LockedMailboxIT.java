package uz.efbazaar.trade.mail;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mail.service.ImapConnectionPool;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;

import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
@Import(StubEscrowConfig.class)
class LockedMailboxIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired MailboxRepository mailboxes;
    @Autowired PlanProjection projection;
    @Autowired MailboxAccessService access;
    @Autowired uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository entitlementRows;
    @MockBean ImapConnectionPool pool;

    @Autowired org.springframework.transaction.PlatformTransactionManager tx;

    @AfterEach
    void forget() { entitlementRows.deleteAll(); }

    private UUID owned(UUID owner, long priority) {
        UUID id = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder().id(id).email("lk-" + id + "@efbazaar.uz")
                .ownerUserId(owner).encryptedPassword(new byte[]{1}).passwordIv(new byte[12])
                .passwordTag(new byte[16]).createdAt(Instant.now()).provisionedAt(Instant.now())
                .accessPriority(priority).build());
        return id;
    }

    private void limitOne() {
        Map<String, String> m = new HashMap<>();
        m.put("mailbox.slots", "1");
        projection.replacePlan("STANDARD", m);
    }

    @Test
    void everyMailEndpointRefusesALockedMailbox() throws Exception {
        limitOne();
        UUID u = UUID.randomUUID();
        UUID locked = owned(u, 1);
        owned(u, 2);

        for (var req : List.of(
                get("/api/v1/mail/{m}/inbox", locked),
                get("/api/v1/mail/{m}/messages/{id}", locked, "7"),
                post("/api/v1/mail/{m}/messages/{id}/read", locked, "7"),
                get("/api/v1/mail/{m}/messages/{id}/attachments/{a}", locked, "7", "1"))) {
            mvc.perform(req.with(asUser(u)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("mailbox_locked"));
        }
        verifyNoInteractions(pool);
    }

    @Test
    void theSidebarMarksItLockedWithoutTouchingTheMailServer() throws Exception {
        limitOne();
        UUID u = UUID.randomUUID();
        UUID locked = owned(u, 1);
        owned(u, 2);

        mvc.perform(get("/api/v1/mailboxes").with(asUser(u)))
                .andExpect(jsonPath("$[?(@.id=='" + locked + "')].locked").value(true));
    }

    @Test
    void aSwapOpensTheChosenOneAndLocksTheOther() throws Exception {
        limitOne();
        UUID u = UUID.randomUUID();
        UUID locked = owned(u, 1), open = owned(u, 2);

        mvc.perform(post("/api/v1/mailboxes/{id}/unlock", locked).with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockInsteadId\":\"" + open + "\"}"))
                .andExpect(status().isNoContent());

        assertThat(access.lockedIds(u)).containsExactly(open);
    }

    @Test
    void aSwapThatMakesNoSenseIsRefused() throws Exception {
        limitOne();
        UUID u = UUID.randomUUID();
        UUID locked = owned(u, 1), open = owned(u, 2);
        UUID stranger = owned(UUID.randomUUID(), 3);

        for (String body : List.of(
                "{\"lockInsteadId\":\"" + locked + "\"}",      // same box
                "{\"lockInsteadId\":\"" + stranger + "\"}")) { // not theirs
            mvc.perform(post("/api/v1/mailboxes/{id}/unlock", locked).with(asUser(u))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("invalid_unlock_swap"));
        }
        // "Unlocking" one that is already open.
        mvc.perform(post("/api/v1/mailboxes/{id}/unlock", open).with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockInsteadId\":\"" + locked + "\"}"))
                .andExpect(status().isConflict());
        assertThat(access.lockedIds(u)).containsExactly(locked);
    }

    @Test
    void aSwapBetweenEqualPrioritiesStillMovesTheLock() throws Exception {
        limitOne();
        UUID u = UUID.randomUUID();
        UUID a = owned(u, 5), b = owned(u, 5);
        UUID lockedNow = access.lockedIds(u).iterator().next();
        UUID openNow = lockedNow.equals(a) ? b : a;

        mvc.perform(post("/api/v1/mailboxes/{id}/unlock", lockedNow).with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lockInsteadId\":\"" + openNow + "\"}"))
                .andExpect(status().isNoContent());

        assertThat(access.lockedIds(u)).containsExactly(openNow);
    }

    @Test
    void adminMailEndpointsIgnoreTheLock() throws Exception {
        limitOne();
        UUID u = UUID.randomUUID();
        UUID locked = owned(u, 1);
        owned(u, 2);

        // The mocked pool hands back no store, so the request fails past the
        // lock check; reaching the pool is the proof that nothing refused it.
        try {
            int status = mvc.perform(get("/api/v1/admin/mailboxes/{id}/inbox", locked).with(asAdmin()))
                    .andReturn().getResponse().getStatus();
            assertThat(status).isNotEqualTo(403);
        } catch (jakarta.servlet.ServletException expectedFromMockedPool) {
            // fine
        }
        verify(pool).acquire(any());
    }
}
