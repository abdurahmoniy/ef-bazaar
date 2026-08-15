package uz.efbazaar.payment.withdrawal.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.payment.security.AuthenticatedUser;
import uz.efbazaar.payment.withdrawal.dto.WithdrawalCreateRequest;
import uz.efbazaar.payment.withdrawal.dto.WithdrawalTicketResponse;
import uz.efbazaar.payment.withdrawal.service.WithdrawalService;

import java.util.List;

/** The wallet owner's side: open a payout request and watch it. */
@RestController
@RequestMapping("/api/v1/payments/withdrawals")
@RequiredArgsConstructor
public class WithdrawalController {

    private final WithdrawalService withdrawals;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WithdrawalTicketResponse open(@AuthenticationPrincipal AuthenticatedUser me,
                                         @Valid @RequestBody WithdrawalCreateRequest req) {
        return WithdrawalTicketResponse.of(withdrawals.open(
                me.userId(), req.amountTiyin(), req.pan(),
                req.holderName(), req.phone(), req.telegramUsername(), me.telegramId()));
    }

    /** Own tickets only — there is no endpoint for reading somebody else's. */
    @GetMapping
    public List<WithdrawalTicketResponse> mine(@AuthenticationPrincipal AuthenticatedUser me) {
        return withdrawals.mine(me.userId()).stream()
                .map(WithdrawalTicketResponse::of)
                .toList();
    }
}
