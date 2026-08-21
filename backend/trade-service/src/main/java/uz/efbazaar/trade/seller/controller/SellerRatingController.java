package uz.efbazaar.trade.seller.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.seller.dto.BatchSellerRatingSummaryRequest;
import uz.efbazaar.trade.seller.dto.RateSellerRequest;
import uz.efbazaar.trade.seller.dto.SellerRatingResponse;
import uz.efbazaar.trade.seller.dto.SellerRatingSummaryResponse;
import uz.efbazaar.trade.seller.service.SellerRatingService;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class SellerRatingController {

    private final SellerRatingService sellerRatings;

    @PostMapping("/api/v1/trades/{id}/seller-rating")
    public SellerRatingResponse rate(@AuthenticationPrincipal AuthenticatedUser me,
                                     @PathVariable UUID id,
                                     @Valid @RequestBody RateSellerRequest req) {
        return sellerRatings.rate(me.userId(), id, req);
    }

    @GetMapping("/api/v1/trades/{id}/seller-rating")
    public ResponseEntity<SellerRatingResponse> getByTradeId(@PathVariable UUID id) {
        return sellerRatings.getByTradeId(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping("/api/v1/sellers/{sellerId}/ratings")
    public List<SellerRatingResponse> listSellerRatings(@PathVariable UUID sellerId) {
        return sellerRatings.listPublic(sellerId);
    }

    @GetMapping("/api/v1/sellers/{sellerId}/rating-summary")
    public SellerRatingSummaryResponse getSellerRatingSummary(@PathVariable UUID sellerId) {
        return sellerRatings.getSummary(sellerId);
    }

    @PostMapping("/api/v1/sellers/rating-summaries/batch")
    public Map<UUID, SellerRatingSummaryResponse> getBatchSummaries(
            @RequestBody BatchSellerRatingSummaryRequest req) {
        return sellerRatings.getSummariesBatch(req.sellerIds());
    }

    @PostMapping("/api/v1/admin/sellers/{sellerId}/ratings/{ratingId}/hide")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public void hideRating(@AuthenticationPrincipal AuthenticatedUser me,
                           @PathVariable UUID sellerId,
                           @PathVariable UUID ratingId) {
        sellerRatings.hide(ratingId, sellerId, me.userId());
    }
}
