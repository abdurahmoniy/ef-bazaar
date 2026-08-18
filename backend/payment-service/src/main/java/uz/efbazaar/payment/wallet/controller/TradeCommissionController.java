package uz.efbazaar.payment.wallet.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.wallet.dto.TradeCommissionConfigResponse;
import uz.efbazaar.payment.wallet.service.TradeCommissionService;

@RestController
@RequestMapping("/api/v1/payments/commission")
@RequiredArgsConstructor
public class TradeCommissionController {

    private final TradeCommissionService commissionService;

    @GetMapping
    public TradeCommissionConfigResponse get() {
        return commissionService.getConfigResponse();
    }
}
