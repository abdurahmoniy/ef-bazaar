package uz.efbazaar.payment.wallet.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.security.AuthenticatedUser;
import uz.efbazaar.payment.wallet.dto.TradeCommissionConfigResponse;
import uz.efbazaar.payment.wallet.dto.UpdateTradeCommissionConfigRequest;
import uz.efbazaar.payment.wallet.service.TradeCommissionService;

@RestController
@RequestMapping("/api/v1/admin/payments/commission")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminTradeCommissionController {

    private final TradeCommissionService commissionService;

    @GetMapping
    public TradeCommissionConfigResponse get() {
        return commissionService.getConfigResponse();
    }

    @PutMapping
    public TradeCommissionConfigResponse update(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @Valid @RequestBody UpdateTradeCommissionConfigRequest req
    ) {
        return commissionService.updateConfig(admin.userId(), req);
    }
}
