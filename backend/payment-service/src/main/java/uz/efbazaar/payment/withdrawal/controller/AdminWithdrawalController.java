package uz.efbazaar.payment.withdrawal.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.payment.security.AuthenticatedUser;
import uz.efbazaar.payment.withdrawal.dto.WithdrawalCloseRequest;
import uz.efbazaar.payment.withdrawal.dto.WithdrawalTicketResponse;
import uz.efbazaar.payment.withdrawal.service.WithdrawalService;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** The paying admin's side: work the queue, see the card, close the ticket. */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/withdrawals")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminWithdrawalController {

    private final WithdrawalService withdrawals;

    /** Oldest first — the order they should be paid in. */
    @GetMapping
    public List<WithdrawalTicketResponse> queue() {
        return withdrawals.queue().stream()
                .map(WithdrawalTicketResponse::of)
                .toList();
    }

    /**
     * The full 16-digit number, because the admin is about to send money to it.
     *
     * <p>Its own endpoint rather than a field on the ticket: that keeps the
     * number out of every list response, and makes each disclosure a request
     * that can be seen in an access log.
     */
    @GetMapping("/{id}/pan")
    public Map<String, String> reveal(@AuthenticationPrincipal AuthenticatedUser me,
                                      @PathVariable UUID id) {
        log.info("Admin {} revealed the destination card of withdrawal {}", me.userId(), id);
        return Map.of("pan", withdrawals.revealPan(id));
    }

    @PostMapping("/{id}/paid")
    public WithdrawalTicketResponse markPaid(@AuthenticationPrincipal AuthenticatedUser me,
                                             @PathVariable UUID id,
                                             @Valid @RequestBody(required = false) WithdrawalCloseRequest body) {
        return WithdrawalTicketResponse.of(
                withdrawals.markPaid(id, me.userId(), body == null ? null : body.note()));
    }

    @PostMapping("/{id}/reject")
    public WithdrawalTicketResponse reject(@AuthenticationPrincipal AuthenticatedUser me,
                                           @PathVariable UUID id,
                                           @Valid @RequestBody(required = false) WithdrawalCloseRequest body) {
        return WithdrawalTicketResponse.of(
                withdrawals.reject(id, me.userId(), body == null ? null : body.note()));
    }
}
