package uz.efbazaar.payment.wallet.controller;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.security.AuthenticatedUser;
import uz.efbazaar.payment.wallet.dto.WalletEntryResponse;
import uz.efbazaar.payment.wallet.dto.WalletResponse;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.util.List;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
@Validated
public class WalletController {

    private final LedgerService ledger;

    /** The caller's own wallet. There is no endpoint for reading somebody else's. */
    @GetMapping("/wallet")
    public WalletResponse myWallet(@AuthenticationPrincipal AuthenticatedUser me) {
        return WalletResponse.of(ledger.balanceOf(me.userId()));
    }

    /** The caller's own ledger entries, newest first. */
    @GetMapping("/wallet/transactions")
    public List<WalletEntryResponse> myHistory(
            @AuthenticationPrincipal AuthenticatedUser me,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return ledger.historyOf(me.userId(), limit);
    }
}
