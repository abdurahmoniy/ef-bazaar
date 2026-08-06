package uz.efbazaar.trade.admin.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileResponse;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileUpsertRequest;
import uz.efbazaar.trade.admin.dto.TradeAdminRatingResponse;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;
import uz.efbazaar.trade.admin.service.TradeAdminRatingService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/**
 * The admin's own settings plus the public profile page.
 *
 * <p>Both {@code /me} and {@code /{userId}} live in this one class on purpose:
 * they describe the same resource (own settings vs. public view), and Spring
 * always prefers the literal {@code /me} segment over the {@code /{userId}}
 * template regardless of how the mappings are grouped.
 *
 * <p>Update is {@code POST}, not {@code PUT}: the nginx location that routes
 * this path carries {@code limit_except GET POST DELETE OPTIONS}, so PUT and
 * PATCH are denied at the edge (spec §12.4).
 */
@RestController
@RequestMapping("/api/v1/trade-admins")
@RequiredArgsConstructor
public class TradeAdminProfileController {

    private final TradeAdminProfileService profiles;
    private final TradeAdminRatingService ratings;

    @GetMapping("/me")
    @PreAuthorize("hasAuthority('ROLE_TRADE_ADMIN')")
    public TradeAdminProfileResponse getMine(@AuthenticationPrincipal AuthenticatedUser me) {
        return profiles.getOwn(me.userId());
    }

    @PostMapping("/me")
    @PreAuthorize("hasAuthority('ROLE_TRADE_ADMIN')")
    public TradeAdminProfileResponse upsertMine(@AuthenticationPrincipal AuthenticatedUser me,
                                                @Valid @RequestBody TradeAdminProfileUpsertRequest req) {
        return profiles.upsert(me.userId(), req);
    }

    @GetMapping("/{userId}")
    public TradeAdminProfileResponse getPublic(@PathVariable UUID userId) {
        return profiles.getPublic(userId);
    }

    @GetMapping("/{userId}/ratings")
    public List<TradeAdminRatingResponse> ratings(@PathVariable UUID userId) {
        return ratings.listPublic(userId);
    }
}
