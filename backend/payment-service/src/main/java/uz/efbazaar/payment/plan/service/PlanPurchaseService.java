package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.plan.domain.Plan;
import uz.efbazaar.payment.plan.domain.PlanPurchase;
import uz.efbazaar.payment.plan.dto.MyPlanResponse;
import uz.efbazaar.payment.plan.dto.PurchasePlanRequest;
import uz.efbazaar.payment.plan.exception.PlanPurchaseException;
import uz.efbazaar.payment.plan.repository.PlanPurchaseRepository;
import uz.efbazaar.payment.plan.repository.PlanRepository;
import uz.efbazaar.payment.plan.repository.UserSubscriptionRepository;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Buying a plan period from the wallet. One transaction: the debit, the history
 * row and the subscription commit together or not at all.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanPurchaseService {

    private final PlanRepository plans;
    private final PlanPriceService prices;
    private final PlanService planService;
    private final UserSubscriptionRepository subscriptions;
    private final PlanPurchaseRepository purchases;
    private final LedgerService ledger;
    private final Clock clock;

    @Transactional
    public MyPlanResponse purchase(UUID userId, Long telegramId, PurchasePlanRequest req) {
        if (isReplay(userId, req.idempotencyKey())) {
            return mine(userId);
        }

        // Before price and balance: an admin has nothing to buy, whatever they ask for.
        if (PlanService.STAFF_PLAN.equals(planService.planFor(userId))) {
            throw new PlanPurchaseException(HttpStatus.CONFLICT, "staff_unlimited",
                    "Admin sifatida barcha imkoniyatlar cheklovsiz");
        }

        Plan target = plans.findById(req.planCode()).filter(Plan::isActive)
                .filter(p -> !PlanService.DEFAULT_PLAN.equals(p.getCode()))
                .orElseThrow(() -> new PlanPurchaseException(HttpStatus.BAD_REQUEST,
                        "plan_not_purchasable", "Bu tarifni sotib olib bo'lmaydi"));
        long price = prices.priceOf(target.getCode(), req.period())
                .orElseThrow(() -> new PlanPurchaseException(HttpStatus.BAD_REQUEST,
                        "plan_not_purchasable", "Bu tarifni sotib olib bo'lmaydi"));
        if (price != req.expectedPriceTiyin()) {
            throw new PlanPurchaseException(HttpStatus.CONFLICT, "price_changed",
                    "Tarif narxi o'zgardi", Map.of("currentPriceTiyin", price));
        }

        subscriptions.ensureRow(userId);
        var sub = subscriptions.lockByUserId(userId).orElseThrow();
        // A twin of this request may have committed while we waited for the lock.
        if (isReplay(userId, req.idempotencyKey())) {
            return mine(userId);
        }
        Instant now = clock.instant();
        boolean live = sub.isLiveAt(now) && !"SYSTEM".equals(sub.getSource());
        String curCode = live ? sub.getPlanCode() : PlanService.DEFAULT_PLAN;
        int curOrder = plans.findById(curCode).map(Plan::getSortOrder).orElse(0);
        var window = PlanTerm.next(new PlanTerm.Current(curCode, curOrder, live ? sub.getExpiresAt() : null),
                target.getCode(), target.getSortOrder(), req.period(), now);

        long available = ledger.balanceOf(userId).getAvailableTiyin();
        if (available < price) {
            // Word for word the shape the frontend's isInsufficientFunds matches.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Hamyonda mablag' yetarli emas — " + ((price - available + 99) / 100)
                            + " so'm yetishmayapti");
        }
        UUID tx = ledger.post(TransactionKind.PLAN_PURCHASE, "plan-purchase:" + req.idempotencyKey(), userId,
                "plan " + target.getCode() + " " + req.period(),
                List.of(new Posting(LedgerAccount.USER_AVAILABLE, userId, price),
                        new Posting(LedgerAccount.PLATFORM_REVENUE, null, -price)));

        purchases.saveAndFlush(PlanPurchase.builder()
                .id(UUID.randomUUID()).userId(userId).planCode(target.getCode()).period(req.period())
                .priceTiyin(price).startsAt(window.startsAt()).expiresAt(window.expiresAt())
                .ledgerTxId(tx).idempotencyKey(req.idempotencyKey()).telegramId(telegramId)
                .createdAt(now).build());
        planService.assign(userId, target.getCode(), window.expiresAt(), "PURCHASE");
        log.info("User {} bought {} {} for {} tiyin, until {}", userId, target.getCode(),
                req.period(), price, window.expiresAt());
        return mine(userId);
    }

    /** A key already used by this user. Another user's key is not a replay; the UNIQUE constraint refuses it. */
    private boolean isReplay(UUID userId, String key) {
        return purchases.findByIdempotencyKey(key).filter(p -> p.getUserId().equals(userId)).isPresent();
    }

    private MyPlanResponse mine(UUID userId) {
        String code = planService.planFor(userId);
        return new MyPlanResponse(code, planService.expiryFor(userId), planService.entitlementsOf(code));
    }
}
