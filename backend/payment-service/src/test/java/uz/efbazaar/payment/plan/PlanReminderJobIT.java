package uz.efbazaar.payment.plan;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import uz.efbazaar.payment.notify.BotClient;
import uz.efbazaar.payment.plan.domain.PlanPeriod;
import uz.efbazaar.payment.plan.domain.PlanPurchase;
import uz.efbazaar.payment.plan.repository.PlanPurchaseRepository;
import uz.efbazaar.payment.plan.service.PlanReminderJob;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.testsupport.ClockTestConfig;
import uz.efbazaar.payment.testsupport.MutableClock;

import java.time.Duration;
import java.time.Instant;
import java.util.OptionalLong;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
        "payment.admin-telegram.enabled=true",
        // The job is driven by hand; keep the scheduler from racing the test.
        "payment.scheduler.plan-reminder-interval-ms=3600000000"
})
@Import(ClockTestConfig.class)
class PlanReminderJobIT extends AbstractPostgresIT {

    @Autowired PlanReminderJob job;
    @Autowired PlanPurchaseRepository purchases;
    @Autowired PlanService plans;
    @Autowired MutableClock clock;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @MockBean BotClient bot;

    static final Instant NOW = Instant.parse("2026-05-01T12:00:00Z");

    @BeforeEach
    void setUp() {
        purchases.deleteAll();
        clock.reset(NOW);
        reset(bot);
        when(bot.sendDirectMessage(anyLong(), anyString())).thenReturn(OptionalLong.of(1));
    }

    private void bought(Instant expires, Long telegram) {
        UUID user = UUID.randomUUID();
        plans.assign(user, "PRO", expires, "PURCHASE");
        purchases.save(PlanPurchase.builder().id(UUID.randomUUID()).userId(user).planCode("PRO")
                .period(PlanPeriod.MONTH).priceTiyin(1_000_000).startsAt(expires.minus(Duration.ofDays(30)))
                .expiresAt(expires).ledgerTxId(UUID.randomUUID()).idempotencyKey(UUID.randomUUID().toString())
                .telegramId(telegram).build());
    }

    @Test
    void remindsOnceThreeDaysAheadAndOnceWhenItEnds() {
        // Sub-millisecond precision, as in production: Postgres keeps microseconds.
        bought(NOW.plus(Duration.ofDays(2)).plusNanos(123_456_789), 111L);
        bought(NOW.minus(Duration.ofHours(5)).plusNanos(123_456_789), 222L);
        bought(NOW.plus(Duration.ofDays(10)), 333L);

        job.run();
        job.run();

        verify(bot, times(1)).sendDirectMessage(eq(111L), contains("3 kun ichida"));
        verify(bot, times(1)).sendDirectMessage(eq(222L), contains("tugadi"));
        verify(bot, never()).sendDirectMessage(eq(333L), anyString());
    }

    @Test
    void aRenewedPlanIsNotRemindedAboutItsOldEnd() {
        UUID user = UUID.randomUUID();
        Instant oldEnd = NOW.plus(Duration.ofDays(2));
        plans.assign(user, "PRO", oldEnd.plus(Duration.ofDays(30)), "PURCHASE");
        purchases.save(PlanPurchase.builder().id(UUID.randomUUID()).userId(user).planCode("PRO")
                .period(PlanPeriod.MONTH).priceTiyin(1).startsAt(NOW).expiresAt(oldEnd)
                .ledgerTxId(UUID.randomUUID()).idempotencyKey(UUID.randomUUID().toString()).telegramId(444L).build());

        job.run();

        verify(bot, never()).sendDirectMessage(eq(444L), anyString());
    }

    @Test
    void ambiguousTelegramFailureIsVisibleAndNeverAutomaticallyDuplicated() {
        bought(NOW.plus(Duration.ofDays(1)), 555L);
        when(bot.sendDirectMessage(eq(555L), anyString())).thenThrow(new RuntimeException("timeout"));
        job.run(); job.run();
        verify(bot, times(1)).sendDirectMessage(eq(555L), anyString());
        org.junit.jupiter.api.Assertions.assertEquals(1, jdbc.queryForObject(
                "SELECT count(*) FROM plan_notices WHERE telegram_id=555 AND telegram_status='UNCONFIRMED'", Integer.class));
    }

    @Test
    void withoutTelegramNothingIsSentAndNothingBreaks() {
        bought(NOW.plus(Duration.ofDays(1)), null);
        job.run();
        verify(bot, never()).sendDirectMessage(anyLong(), anyString());
    }
}
