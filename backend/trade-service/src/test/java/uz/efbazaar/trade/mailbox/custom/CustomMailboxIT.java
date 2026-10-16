package uz.efbazaar.trade.mailbox.custom;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.domain.MailboxSource;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.domain.UserPlanView;
import uz.efbazaar.trade.plan.repository.PlanEntitlementViewRepository;
import uz.efbazaar.trade.plan.repository.UserPlanViewRepository;
import uz.efbazaar.trade.plan.service.PlanProjection;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/** Checking and claiming a self-named mailbox. */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "trade.mailbox.domains=efbazaar.uz,efootball.uz",
        "trade.mailbox.premium-domain-plans=MAX,STAFF"})
class CustomMailboxIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired MailboxRepository mailboxes;
    @Autowired PlanProjection projection;
    @Autowired PlanEntitlementViewRepository entitlementRows;
    @Autowired UserPlanViewRepository userPlanRows;
    @MockBean TradeEventPublisher events;

    @AfterEach
    void forget() {
        entitlementRows.deleteAll();
        userPlanRows.deleteAll();
    }

    private UUID userOn(String plan, String customSlots) {
        Map<String, String> g = new HashMap<>();
        g.put("mailbox.slots", "5");
        g.put("mailbox.custom_slots", customSlots);
        projection.replacePlan(plan, g);
        UUID u = UUID.randomUUID();
        if (!"STANDARD".equals(plan)) {
            userPlanRows.saveAndFlush(UserPlanView.builder().userId(u).planCode(plan)
                    .updatedAt(Instant.now()).build());
        }
        return u;
    }

    private static String unique() {
        return "n" + Long.toString(System.nanoTime(), 36).substring(0, 8);
    }

    private String claimBody(String local, String domain) {
        return "{\"localPart\":\"" + local + "\",\"domain\":\"" + domain + "\"}";
    }

    @Test
    void jaydariSeesAvailableButCannotClaim() throws Exception {
        UUID u = userOn("STANDARD", "0");
        String name = unique();
        mvc.perform(get("/api/v1/mailboxes/custom/availability")
                        .param("localPart", name).param("domain", "efbazaar.uz").with(asUser(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(name + "@efbazaar.uz"))
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.canClaim").value(false))
                .andExpect(jsonPath("$.claimBlock").value("NO_SLOT"));
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody(name, "efbazaar.uz")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("no_slot"));
    }

    @Test
    void proCannotUsePremiumDomain() throws Exception {
        UUID u = userOn("PRO", "1");
        String name = unique();
        mvc.perform(get("/api/v1/mailboxes/custom/availability")
                        .param("localPart", name).param("domain", "efootball.uz").with(asUser(u)))
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.canClaim").value(false))
                .andExpect(jsonPath("$.claimBlock").value("PLAN_DOMAIN"));
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody(name, "efootball.uz")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("plan_domain"));
    }

    @Test
    void proClaimsOneOnDefaultDomain() throws Exception {
        UUID u = userOn("PRO", "1");
        String name = unique();
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody(name, "efbazaar.uz")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value(name + "@efbazaar.uz"))
                .andExpect(jsonPath("$.provisioned").value(false));

        Mailbox row = mailboxes.findByEmail(name + "@efbazaar.uz").orElseThrow();
        assertThat(row.getKind()).isEqualTo(MailboxKind.CUSTOM);
        assertThat(row.getSource()).isEqualTo(MailboxSource.USER);
        assertThat(row.getOwnerUserId()).isEqualTo(u);
        assertThat(row.getProvisionedAt()).isNull();
        verify(events).mailboxProvisionRequest(eq(row.getId()), eq(name), eq("efbazaar.uz"));

        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody(unique(), "efbazaar.uz")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("no_slot"));
    }

    @Test
    void maxClaimsOnPremiumDomain() throws Exception {
        UUID u = userOn("MAX", "3");
        String name = unique();
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody(name, "efootball.uz")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value(name + "@efootball.uz"));
    }

    @Test
    void takenIncludesDeletedRows() throws Exception {
        UUID u = userOn("PRO", "1");
        String name = unique();
        mailboxes.saveAndFlush(Mailbox.builder().id(UUID.randomUUID()).email(name + "@efbazaar.uz")
                .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16])
                .createdAt(Instant.now()).deletedAt(Instant.now()).build());

        mvc.perform(get("/api/v1/mailboxes/custom/availability")
                        .param("localPart", name).param("domain", "efbazaar.uz").with(asUser(u)))
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.reason").value("TAKEN"));
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody(name, "efbazaar.uz")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("taken"));
    }

    @Test
    void reservedAndInvalidNames() throws Exception {
        UUID u = userOn("PRO", "1");
        mvc.perform(get("/api/v1/mailboxes/custom/availability")
                        .param("localPart", "admin").param("domain", "efbazaar.uz").with(asUser(u)))
                .andExpect(jsonPath("$.reason").value("RESERVED"));
        mvc.perform(get("/api/v1/mailboxes/custom/availability")
                        .param("localPart", "ab").param("domain", "efbazaar.uz").with(asUser(u)))
                .andExpect(jsonPath("$.reason").value("INVALID"));
        mvc.perform(get("/api/v1/mailboxes/custom/availability")
                        .param("localPart", "alibek1").param("domain", "gmail.com").with(asUser(u)))
                .andExpect(jsonPath("$.reason").value("DOMAIN_NOT_ALLOWED"));
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody("admin", "efbazaar.uz")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("reserved"));
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody("a.b", "efbazaar.uz")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid"));
    }

    @Test
    void uppercaseIsStoredLowercase() throws Exception {
        UUID u = userOn("PRO", "1");
        String name = unique();
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                        .contentType(MediaType.APPLICATION_JSON).content(claimBody(name.toUpperCase(), "EFBAZAAR.UZ")))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.email").value(name + "@efbazaar.uz"));
    }

    @Test
    void twoUsersRacingForOneNameOnlyOneWins() throws Exception {
        UUID a = userOn("PRO", "1");
        UUID b = UUID.randomUUID();
        userPlanRows.saveAndFlush(UserPlanView.builder().userId(b).planCode("PRO").updatedAt(Instant.now()).build());
        String name = unique();
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (UUID u : List.of(a, b)) {
                results.add(pool.submit(() -> {
                    go.await();
                    return mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                                    .contentType(MediaType.APPLICATION_JSON).content(claimBody(name, "efbazaar.uz")))
                            .andReturn().getResponse().getStatus();
                }));
            }
            go.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : results) statuses.add(f.get());
            assertThat(statuses).containsExactlyInAnyOrder(202, 409);
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void listsOnlyOwnCustomBoxesAndOwnedListShowsKind() throws Exception {
        UUID u = userOn("PRO", "1");
        String name = unique();
        mvc.perform(post("/api/v1/mailboxes/custom").with(asUser(u))
                .contentType(MediaType.APPLICATION_JSON).content(claimBody(name, "efbazaar.uz")));
        mailboxes.saveAndFlush(Mailbox.builder().id(UUID.randomUUID()).email("r" + unique() + "@efbazaar.uz")
                .ownerUserId(u).encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16])
                .createdAt(Instant.now()).build());

        mvc.perform(get("/api/v1/mailboxes/custom").with(asUser(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].email").value(name + "@efbazaar.uz"))
                .andExpect(jsonPath("$[0].locked").value(false))
                .andExpect(jsonPath("$[0].linkedAccountId").doesNotExist());
        mvc.perform(get("/api/v1/mailboxes").with(asUser(u)))
                .andExpect(jsonPath("$[?(@.email == '" + name + "@efbazaar.uz')].kind").value("CUSTOM"));
        mvc.perform(get("/api/v1/mailboxes/custom").with(asUser(UUID.randomUUID())))
                .andExpect(jsonPath("$.length()").value(0));
    }
}
