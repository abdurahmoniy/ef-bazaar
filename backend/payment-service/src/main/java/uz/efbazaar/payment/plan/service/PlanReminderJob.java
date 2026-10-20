package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Catch up every missed deadline; an in-app notice is the durable source of truth. */
@Component
@RequiredArgsConstructor
public class PlanReminderJob {
    private final PlanNoticeService notices;
    private final PlanNoticeTelegramDelivery delivery;

    @Scheduled(fixedDelayString = "${payment.scheduler.plan-reminder-interval-ms:3600000}",
            initialDelayString = "${payment.scheduler.plan-reminder-interval-ms:3600000}")
    public void run() {
        notices.generate();
        delivery.dispatch();
    }
}
