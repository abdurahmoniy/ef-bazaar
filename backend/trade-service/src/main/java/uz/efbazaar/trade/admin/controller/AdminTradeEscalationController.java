package uz.efbazaar.trade.admin.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.admin.dto.AdminCancelRequest;
import uz.efbazaar.trade.admin.dto.AssignAdminRequest;
import uz.efbazaar.trade.admin.service.TradeAdminRatingService;
import uz.efbazaar.trade.admin.service.TradeEscalationService;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.List;
import java.util.UUID;

/**
 * Platform staff surface. {@code /api/v1/admin/**} is already gated to
 * {@code ROLE_ADMIN} in SecurityConfig; the annotation is belt-and-braces so
 * the class stays safe if the path ever moves.
 */
@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
public class AdminTradeEscalationController {

    private final TradeEscalationService escalations;
    private final TradeAdminRatingService ratings;
    private final TradeService trades;

    @GetMapping("/trades/escalated")
    public List<TradeResponse> escalated() {
        return escalations.listEscalated().stream()
                .map(t -> trades.toResponse(t, null))
                .toList();
    }

    @PostMapping("/trades/{id}/reassign")
    public void reassign(@AuthenticationPrincipal AuthenticatedUser me,
                         @PathVariable UUID id,
                         @Valid @RequestBody AssignAdminRequest req) {
        escalations.reassign(me.userId(), id, req.adminId(), req.feeUzs());
    }

    // Reuses TradeAdminWorkController's AdminCancelRequest (Task 13) rather
    // than a bare @RequestParam — same validated, size-bounded free-text
    // reason shape for both the admin's own cancel and the platform's.
    @PostMapping("/trades/{id}/cancel")
    public void cancel(@AuthenticationPrincipal AuthenticatedUser me,
                       @PathVariable UUID id,
                       @Valid @RequestBody(required = false) AdminCancelRequest req) {
        escalations.cancel(me.userId(), id, req == null ? null : req.reason());
    }

    @PostMapping("/trade-admins/{userId}/ratings/{ratingId}/hide")
    public void hideRating(@AuthenticationPrincipal AuthenticatedUser me,
                           @PathVariable UUID userId,
                           @PathVariable UUID ratingId) {
        ratings.hide(ratingId, me.userId());
    }
}
