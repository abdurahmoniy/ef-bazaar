package uz.efbazaar.payment.plan.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.plan.dto.AssignPlanRequest;
import uz.efbazaar.payment.plan.dto.MyPlanResponse;
import uz.efbazaar.payment.plan.service.PlanService;

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

    @PostMapping("/assign")
    public MyPlanResponse assign(@Valid @RequestBody AssignPlanRequest req) {
        var sub = plans.assign(req.userId(), req.planCode(), req.expiresAt(), req.source());
        return new MyPlanResponse(sub.getPlanCode(), sub.getExpiresAt(),
                plans.entitlementsOf(sub.getPlanCode()));
    }
}
