package uz.efbazaar.payment.plan.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.plan.dto.MyPlanResponse;
import uz.efbazaar.payment.plan.dto.PlanResponse;
import uz.efbazaar.payment.plan.dto.PurchasePlanRequest;
import uz.efbazaar.payment.plan.service.PlanPriceService;
import uz.efbazaar.payment.plan.service.PlanPurchaseService;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.List;

/**
 * What the plans are, and which one you are on.
 *
 * <p>The catalogue is public: a signed-out visitor comparing tariffs is the
 * point of having them.
 */
@RestController
@RequestMapping("/api/v1/payments/plans")
@RequiredArgsConstructor
public class PlanController {

    private final PlanService plans;
    private final PlanPriceService prices;
    private final PlanPurchaseService purchases;

    @GetMapping
    public List<PlanResponse> catalogue() {
        return plans.activePlans().stream()
                .map(p -> PlanResponse.of(p, plans.entitlementsOf(p.getCode()), prices.pricesOf(p.getCode())))
                .toList();
    }

    @GetMapping("/me")
    public MyPlanResponse mine(@AuthenticationPrincipal AuthenticatedUser me) {
        String code = plans.planFor(me.userId());
        return new MyPlanResponse(code, plans.expiryFor(me.userId()), plans.entitlementsOf(code));
    }

    @PostMapping("/purchase")
    public MyPlanResponse purchase(@AuthenticationPrincipal AuthenticatedUser me,
                                   @Valid @RequestBody PurchasePlanRequest req) {
        return purchases.purchase(me.userId(), me.telegramId(), req);
    }
}
