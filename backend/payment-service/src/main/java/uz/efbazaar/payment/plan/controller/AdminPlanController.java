package uz.efbazaar.payment.plan.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.plan.dto.AssignPlanRequest;
import uz.efbazaar.payment.plan.dto.MyPlanResponse;
import uz.efbazaar.payment.plan.dto.PlanPriceRow;
import uz.efbazaar.payment.plan.dto.UpdatePlanPricesRequest;
import uz.efbazaar.payment.plan.service.PlanPriceService;
import uz.efbazaar.payment.plan.service.PlanService;
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.List;

/**
 * Putting a user on a plan by hand.
 *
 * <p>The only way in for now. When plans become purchasable the buy flow calls
 * the same service method with a different {@code source}, so nothing here has
 * to move.
 */
@RestController
@RequestMapping("/api/v1/admin/plans")
@RequiredArgsConstructor
public class AdminPlanController {

    private final PlanService plans;
    private final PlanPriceService prices;

    @PostMapping("/assign")
    public MyPlanResponse assign(@Valid @RequestBody AssignPlanRequest req) {
        var sub = plans.assign(req.userId(), req.planCode(), req.expiresAt(), req.source());
        return new MyPlanResponse(sub.getPlanCode(), sub.getExpiresAt(),
                plans.entitlementsOf(sub.getPlanCode()));
    }

    @GetMapping("/prices")
    public List<PlanPriceRow> prices() {
        return prices.all();
    }

    @PutMapping("/prices")
    public List<PlanPriceRow> updatePrices(@AuthenticationPrincipal AuthenticatedUser me,
                                           @Valid @RequestBody UpdatePlanPricesRequest req) {
        return prices.update(me.userId(), req.prices());
    }
}
