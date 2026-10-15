package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.notify.AdminTelegramNotifier;
import uz.efbazaar.payment.plan.domain.PlanPurchase;
import uz.efbazaar.payment.plan.repository.PlanPurchaseRepository;
import uz.efbazaar.payment.plan.repository.UserSubscriptionRepository;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Tells a buyer their plan is about to end, and that it has.
 *
 * <p>Single instance, like InvoiceExpirySweeper. A purchase that a later one
 * superseded is marked reminded without sending: the user is still live and
 * "your plan ends" would be false.
 */
@Component
@RequiredArgsConstructor
public class PlanReminderJob {

    private final PlanPurchaseRepository purchases;
    private final UserSubscriptionRepository subscriptions;
    private final AdminTelegramNotifier notifier;
    private final Clock clock;

    @Scheduled(fixedDelayString = "${payment.scheduler.plan-reminder-interval-ms:3600000}",
            initialDelayString = "${payment.scheduler.plan-reminder-interval-ms:3600000}")
    @Transactional
    public void run() {
        Instant now = clock.instant();
        for (PlanPurchase p : purchases.findByExpiresAtBetweenAndRemindedBeforeAtIsNull(now, now.plus(Duration.ofDays(3)))) {
            if (stillTheEndOf(p)) notifier.planReminderToOwner(p.getTelegramId(), p.getPlanCode(), false);
            p.setRemindedBeforeAt(now);
        }
        for (PlanPurchase p : purchases.findByExpiresAtBetweenAndRemindedExpiredAtIsNull(now.minus(Duration.ofDays(1)), now)) {
            if (stillTheEndOf(p)) notifier.planReminderToOwner(p.getTelegramId(), p.getPlanCode(), true);
            p.setRemindedExpiredAt(now);
            p.setRemindedBeforeAt(p.getRemindedBeforeAt() == null ? now : p.getRemindedBeforeAt());
        }
    }

    /** True when this purchase's end is the user's actual end — not overtaken by a renewal or upgrade. */
    private boolean stillTheEndOf(PlanPurchase p) {
        return subscriptions.findById(p.getUserId())
                .map(s -> s.getExpiresAt() != null
                        && s.getExpiresAt().truncatedTo(ChronoUnit.MILLIS)
                                .equals(p.getExpiresAt().truncatedTo(ChronoUnit.MILLIS)))
                .orElse(false);
    }
}
