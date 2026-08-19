package uz.efbazaar.trade.seller.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.security.AuthSummaryClient;
import uz.efbazaar.trade.seller.domain.SellerRating;
import uz.efbazaar.trade.seller.dto.RateSellerRequest;
import uz.efbazaar.trade.seller.dto.SellerRatingResponse;
import uz.efbazaar.trade.seller.dto.SellerRatingSummaryResponse;
import uz.efbazaar.trade.seller.repository.SellerRatingRepository;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 1–5 star rating of a seller from the buyer after a trade succeeds.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SellerRatingService {

    private final SellerRatingRepository ratings;
    private final TradeService tradeService;
    private final TradeAuditService audit;
    private final AuthSummaryClient authSummaries;

    @Value("${trade.seller.rating-window-days:14}")
    private long windowDays;

    @Transactional
    public SellerRatingResponse rate(UUID buyerId, UUID tradeId, RateSellerRequest req) {
        Trade t = tradeService.get(tradeId, buyerId);

        if (!buyerId.equals(t.getBuyerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Faqat xaridor sotuvchini baholashi mumkin");
        }
        if (t.getState() != TradeState.SUCCESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Baholash savdo muvaffaqiyatli yakunlangach ochiladi");
        }

        Instant closedAt = t.getUpdatedAt();
        if (closedAt == null) {
            throw new IllegalStateException(
                    "Trade " + tradeId + " has no updatedAt; refusing to open a rating window");
        }
        if (closedAt.plus(Duration.ofDays(windowDays)).isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Baholash muddati tugagan (%d kun)".formatted(windowDays));
        }
        if (ratings.findByTradeId(tradeId).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Siz bu savdo uchun sotuvchini allaqachon baholadingiz");
        }

        String comment = req.comment() != null && !req.comment().isBlank() ? req.comment().trim() : null;
        SellerRating r = ratings.save(SellerRating.builder()
                .id(UUID.randomUUID())
                .tradeId(tradeId)
                .sellerId(t.getSellerId())
                .raterId(buyerId)
                .stars(req.stars().shortValue())
                .comment(comment)
                .build());

        audit.record(tradeId, ActorType.USER, buyerId, "SELLER_RATED",
                Map.of("stars", String.valueOf(req.stars()), "sellerId", t.getSellerId().toString()));

        return toResponse(r);
    }

    @Transactional(readOnly = true)
    public Optional<SellerRatingResponse> getByTradeId(UUID tradeId) {
        return ratings.findByTradeId(tradeId).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public List<SellerRatingResponse> listPublic(UUID sellerId) {
        List<SellerRating> list = ratings.findBySellerIdOrderByCreatedAtDesc(sellerId);
        if (list.isEmpty()) {
            return List.of();
        }
        List<UUID> raterIds = list.stream().map(SellerRating::getRaterId).distinct().toList();
        Map<UUID, AuthSummaryClient.UserSummary> summaries = authSummaries.resolveAll(raterIds);

        return list.stream()
                .map(r -> {
                    AuthSummaryClient.UserSummary s = summaries.get(r.getRaterId());
                    return SellerRatingResponse.of(
                            r,
                            s != null ? s.displayName() : null,
                            s != null ? s.telegramUsername() : null,
                            s != null ? s.telegramPhotoUrl() : null
                    );
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public SellerRatingSummaryResponse getSummary(UUID sellerId) {
        List<SellerRating> list = ratings.findBySellerIdOrderByCreatedAtDesc(sellerId);
        return calculateSummary(sellerId, list);
    }

    @Transactional(readOnly = true)
    public Map<UUID, SellerRatingSummaryResponse> getSummariesBatch(Collection<UUID> sellerIds) {
        if (sellerIds == null || sellerIds.isEmpty()) {
            return Map.of();
        }
        List<SellerRating> list = ratings.findBySellerIdIn(sellerIds);
        Map<UUID, List<SellerRating>> grouped = list.stream()
                .collect(Collectors.groupingBy(SellerRating::getSellerId));

        Map<UUID, SellerRatingSummaryResponse> result = new LinkedHashMap<>();
        for (UUID sid : sellerIds) {
            List<SellerRating> sellerRatings = grouped.getOrDefault(sid, List.of());
            result.put(sid, calculateSummary(sid, sellerRatings));
        }
        return result;
    }

    @Transactional
    public void hide(UUID ratingId, UUID expectedSellerId, UUID platformAdminId) {
        SellerRating r = ratings.findById(ratingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Baho topilmadi"));
        if (!r.getSellerId().equals(expectedSellerId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Baho topilmadi");
        }
        if (r.isHidden()) return;
        r.setHiddenAt(Instant.now());
        r.setHiddenBy(platformAdminId);
        ratings.save(r);
        audit.record(r.getTradeId(), ActorType.ADMIN, platformAdminId, "SELLER_RATING_HIDDEN",
                Map.of("ratingId", ratingId.toString()));
    }

    private SellerRatingSummaryResponse calculateSummary(UUID sellerId, List<SellerRating> list) {
        if (list == null || list.isEmpty()) {
            return SellerRatingSummaryResponse.empty(sellerId);
        }
        long count = list.size();
        long sum = 0;
        Map<Integer, Long> starCounts = new HashMap<>();
        for (int i = 1; i <= 5; i++) starCounts.put(i, 0L);

        for (SellerRating r : list) {
            int s = r.getStars();
            sum += s;
            starCounts.put(s, starCounts.getOrDefault(s, 0L) + 1);
        }

        double avg = BigDecimal.valueOf((double) sum / count)
                .setScale(1, RoundingMode.HALF_UP)
                .doubleValue();

        return new SellerRatingSummaryResponse(sellerId, avg, count, sum, starCounts);
    }

    private SellerRatingResponse toResponse(SellerRating r) {
        AuthSummaryClient.UserSummary s = authSummaries.resolve(r.getRaterId()).orElse(null);
        return SellerRatingResponse.of(
                r,
                s != null ? s.displayName() : null,
                s != null ? s.telegramUsername() : null,
                s != null ? s.telegramPhotoUrl() : null
        );
    }
}
