package uz.efbazaar.trade.admin.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.admin.dto.MarkStepRequest;
import uz.efbazaar.trade.admin.dto.TradeStepResponse;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeStepService;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.domain.TradeStep;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.List;
import java.util.UUID;

/** The admin's own workspace: invitations, active trades, accept and decline. */
@RestController
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_TRADE_ADMIN')")
public class TradeAdminWorkController {

    private final TradeAdminAssignmentService assignments;
    private final TradeService trades;
    private final TradeStepService stepService;

    @GetMapping("/api/v1/trade-admins/me/invitations")
    public List<TradeResponse> invitations(@AuthenticationPrincipal AuthenticatedUser me) {
        return assignments.listInvitations(me.userId()).stream()
                .map(t -> trades.toResponse(t, null))
                .toList();
    }

    @GetMapping("/api/v1/trade-admins/me/trades")
    public List<TradeResponse> myTrades(@AuthenticationPrincipal AuthenticatedUser me) {
        return assignments.listMyTrades(me.userId()).stream()
                .map(t -> trades.toResponse(t, null))
                .toList();
    }

    @PostMapping("/api/v1/trades/{id}/actions/admin-accept")
    public TradeResponse accept(@AuthenticationPrincipal AuthenticatedUser me,
                                @PathVariable UUID id) {
        assignments.accept(me.userId(), id);
        return trades.toResponse(trades.getForViewer(id, me.userId()), null);
    }

    @PostMapping("/api/v1/trades/{id}/actions/admin-decline")
    public void decline(@AuthenticationPrincipal AuthenticatedUser me,
                        @PathVariable UUID id) {
        assignments.decline(me.userId(), id);
        // No body: after declining the caller is no longer a viewer of this trade.
    }

    @GetMapping("/api/v1/trades/{id}/steps")
    @PreAuthorize("isAuthenticated()")
    public List<TradeStepResponse> steps(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id) {
        return stepService.list(id, me.userId());
    }

    @PostMapping("/api/v1/trades/{id}/steps/{step}")
    public List<TradeStepResponse> markStep(@AuthenticationPrincipal AuthenticatedUser me,
                                            @PathVariable UUID id,
                                            @PathVariable TradeStep step,
                                            @Valid @RequestBody(required = false) MarkStepRequest req) {
        return stepService.mark(id, me.userId(), step, req == null ? null : req.note());
    }

    @DeleteMapping("/api/v1/trades/{id}/steps/{step}")
    public List<TradeStepResponse> unmarkStep(@AuthenticationPrincipal AuthenticatedUser me,
                                              @PathVariable UUID id,
                                              @PathVariable TradeStep step) {
        return stepService.unmark(id, me.userId(), step);
    }
}
