package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminRating;
import uz.efbazaar.trade.admin.dto.RateAdminRequest;
import uz.efbazaar.trade.admin.dto.TradeAdminRatingResponse;
import uz.efbazaar.trade.admin.repository.TradeAdminRatingRepository;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 1–5 stars from each party after a human trade succeeds.
 *
 * <p>Not a chat message, so it works after the chat has closed. Optional — a
 * party who never rates blocks nothing.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeAdminRatingService {

    private final TradeAdminRatingRepository ratings;
    private final TradeService tradeService;
    private final TradeAdminStats stats;
    private final TradeAuditService audit;

    @Value("${trade.human.rating-window-days:7}")
    private long windowDays;

    @Transactional
    public TradeAdminRatingResponse rate(UUID raterId, UUID tradeId, RateAdminRequest req) {
        // Party-only: get() excludes the admin, so they cannot rate themselves.
        Trade t = tradeService.get(tradeId, raterId);

        if (t.getMode() != TradeMode.HUMAN || t.getAssignedAdminId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu savdoda baholanadigan admin yo'q");
        }
        if (t.getState() != TradeState.SUCCESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Baholash savdo muvaffaqiyatli yakunlangach ochiladi");
        }
        Instant closedAt = t.getUpdatedAt() == null ? Instant.now() : t.getUpdatedAt();
        if (closedAt.plus(Duration.ofDays(windowDays)).isBefore(Instant.now())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Baholash muddati tugagan (%d kun)".formatted(windowDays));
        }
        if (ratings.findByTradeIdAndRaterId(tradeId, raterId).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Siz bu savdoni allaqachon baholadingiz");
        }

        ParticipantRole role = t.roleFor(raterId);
        TradeAdminRating r = ratings.save(TradeAdminRating.builder()
                .id(UUID.randomUUID())
                .tradeId(tradeId)
                .adminId(t.getAssignedAdminId())
                .raterId(raterId)
                .raterRole(role)
                .stars(req.stars().shortValue())
                .comment(req.comment())
                .build());

        stats.recordRating(t.getAssignedAdminId(), req.stars());
        audit.record(tradeId, ActorType.USER, raterId, "ADMIN_RATED",
                Map.of("stars", String.valueOf(req.stars()), "role", role.name()));

        return TradeAdminRatingResponse.of(r);
    }

    @Transactional(readOnly = true)
    public List<TradeAdminRatingResponse> listPublic(UUID adminId) {
        return ratings.findByAdminIdOrderByCreatedAtDesc(adminId).stream()
                .map(TradeAdminRatingResponse::of)
                .toList();
    }

    /**
     * Platform moderation. Blanks the comment text and nothing else — the star
     * stays in the average, so hiding cannot be used to raise a score.
     */
    @Transactional
    public void hide(UUID ratingId, UUID platformAdminId) {
        TradeAdminRating r = ratings.findById(ratingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Baho topilmadi"));
        if (r.isHidden()) return;
        r.setHiddenAt(Instant.now());
        r.setHiddenBy(platformAdminId);
        ratings.save(r);
        audit.record(r.getTradeId(), ActorType.ADMIN, platformAdminId, "RATING_HIDDEN",
                Map.of("ratingId", ratingId.toString()));
    }
}
