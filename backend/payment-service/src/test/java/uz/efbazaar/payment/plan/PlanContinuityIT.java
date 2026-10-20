package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import com.fasterxml.jackson.databind.ObjectMapper;
import uz.efbazaar.payment.notify.BotClient;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.plan.service.PlanReminderJob;
import uz.efbazaar.payment.testsupport.*;
import java.time.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest(properties = "payment.scheduler.plan-reminder-interval-ms=3600000000")
@AutoConfigureMockMvc
@Import(ClockTestConfig.class)
class PlanContinuityIT extends AbstractPostgresIT {
    @Autowired PlanService plans;
    @Autowired PlanReminderJob reminders;
    @Autowired MutableClock clock;
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @MockBean BotClient bot;
    static final Instant NOW = Instant.parse("2026-10-19T12:00:00Z");
    @BeforeEach void setup() { clock.reset(NOW); }

    @Test void freeTombstoneRetainsPaidEndWithoutGrantingPro() throws Exception {
        UUID user = UUID.randomUUID();
        Instant end = NOW.minus(Duration.ofDays(2));
        plans.assign(user, "PRO", end, "PURCHASE");
        plans.assign(user, "STANDARD", null, "SYSTEM");
        mvc.perform(get("/api/v1/payments/plans/me").with(asUser(user)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("STANDARD"))
            .andExpect(jsonPath("$.expiresAt").isEmpty())
            .andExpect(jsonPath("$.lastPaidExpiresAt").value(end.toString()))
            .andExpect(jsonPath("$.graceEndsAt").value(end.plus(Duration.ofDays(30)).toString()));
    }

    @Test void missedJobsCatchExpiryAndGraceOnceWithoutTelegramAndProtectReadOwnership() throws Exception {
        UUID user = UUID.randomUUID();
        Instant end = NOW.minus(Duration.ofDays(32));
        plans.assign(user, "PRO", end, "ADMIN");
        plans.assign(user, "STANDARD", null, "SYSTEM");
        reminders.run(); reminders.run();
        String body = mvc.perform(get("/api/v1/payments/plans/notices").with(asUser(user)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[?(@.kind=='EXPIRED')]").isNotEmpty())
            .andExpect(jsonPath("$[?(@.kind=='GRACE_ENDED')]").isNotEmpty())
            .andReturn().getResponse().getContentAsString();
        String id = json.readTree(body).get(0).get("id").asText();
        mvc.perform(post("/api/v1/payments/plans/notices/" + id + "/read").with(asUser(UUID.randomUUID())))
            .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/payments/plans/notices/" + id + "/read").with(asUser(user)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.readAt").isNotEmpty());
        mvc.perform(post("/api/v1/payments/plans/notices/" + id + "/read").with(asUser(user)))
            .andExpect(status().isOk());
    }

    @Test void exactGraceBoundaryAndRenewalSupersedeOldReminders() throws Exception {
        UUID user = UUID.randomUUID();
        Instant end = NOW.minus(Duration.ofDays(30)).plusSeconds(1);
        plans.assign(user, "PRO", end, "PURCHASE");
        reminders.run();
        mvc.perform(get("/api/v1/payments/plans/notices").with(asUser(user)))
            .andExpect(jsonPath("$.length()").value(1));
        clock.advance(Duration.ofSeconds(1)); reminders.run();
        mvc.perform(get("/api/v1/payments/plans/notices").with(asUser(user)))
            .andExpect(jsonPath("$.length()").value(2));
        plans.assign(user, "PRO", NOW.plus(Duration.ofDays(30)), "PURCHASE");
        reminders.run();
        mvc.perform(get("/api/v1/payments/plans/notices").with(asUser(user)))
            .andExpect(jsonPath("$.length()").value(0));
    }
}
