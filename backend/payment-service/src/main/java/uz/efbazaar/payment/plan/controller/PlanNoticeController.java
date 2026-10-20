package uz.efbazaar.payment.plan.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.payment.plan.dto.PlanNoticeResponse;
import uz.efbazaar.payment.plan.service.PlanNoticeService;
import uz.efbazaar.payment.security.AuthenticatedUser;
import java.util.*;

@RestController
@RequestMapping("/api/v1/payments/plans/notices")
@RequiredArgsConstructor
public class PlanNoticeController {
    private final PlanNoticeService notices;
    @GetMapping public List<PlanNoticeResponse> list(@AuthenticationPrincipal AuthenticatedUser me) {
        return notices.list(me.userId());
    }
    @PostMapping("/{id}/read") public PlanNoticeResponse read(@AuthenticationPrincipal AuthenticatedUser me,
                                                            @PathVariable UUID id) {
        return notices.markRead(me.userId(),id);
    }
}
