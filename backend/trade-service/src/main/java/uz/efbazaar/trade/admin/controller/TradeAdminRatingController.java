package uz.efbazaar.trade.admin.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.admin.dto.RateAdminRequest;
import uz.efbazaar.trade.admin.dto.TradeAdminRatingResponse;
import uz.efbazaar.trade.admin.service.TradeAdminRatingService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class TradeAdminRatingController {

    private final TradeAdminRatingService ratings;

    @PostMapping("/api/v1/trades/{id}/rating")
    public TradeAdminRatingResponse rate(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @Valid @RequestBody RateAdminRequest req) {
        return ratings.rate(me.userId(), id, req);
    }
}
