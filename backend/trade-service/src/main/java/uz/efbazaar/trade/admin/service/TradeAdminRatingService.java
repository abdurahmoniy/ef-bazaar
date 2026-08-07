package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
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
        // The window is measured from Trade.updatedAt, which stands in for "when
        // the trade reached SUCCESS": TradeService.transition() saves the row on
        // every state change and @PreUpdate stamps updatedAt at that instant, and
        // nothing writes the Trade row again once it is terminal (TradeDeadlineExtender
        // and TradeCloseService both gate on non-terminal state; TradeAdminAssignmentService
        // only touches WAITING_ADMIN rows). This is safe only as long as that holds.
        // If a future change starts writing to a SUCCESS trade — a correction flow, an
        // admin note, anything — this anchor silently drifts and the window resets.
        // Add an explicit closed_at column (stamped once, on the SUCCESS transition)
        // instead of widening this assumption.
        Instant closedAt = t.getUpdatedAt();
        if (closedAt == null) {
            // @PrePersist/@PreUpdate always set this, so this should be unreachable.
            // Fail closed — refuse the rating rather than silently granting a fresh window.
            throw new IllegalStateException(
                    "Trade " + tradeId + " has no updatedAt; refusing to open a rating window");
        }
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
     *
     * <p>{@code expectedAdminId} is the admin named in the URL
     * ({@code /trade-admins/{userId}/ratings/{ratingId}/hide}). Verifying it
     * against the rating's actual admin catches a UI bug that names the wrong
     * admin in the path — the same {@code ratingId} could otherwise be hidden
     * through anybody's URL. 404 rather than a more specific status, matching
     * this codebase's habit of not confirming a resource's existence/shape to
     * a caller whose path doesn't match it.
     */
    @Transactional
    public void hide(UUID ratingId, UUID expectedAdminId, UUID platformAdminId) {
        TradeAdminRating r = ratings.findById(ratingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Baho topilmadi"));
        if (!r.getAdminId().equals(expectedAdminId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Baho topilmadi");
        }
        if (r.isHidden()) return;
        r.setHiddenAt(Instant.now());
        r.setHiddenBy(platformAdminId);
        ratings.save(r);
        audit.record(r.getTradeId(), ActorType.ADMIN, platformAdminId, "RATING_HIDDEN",
                Map.of("ratingId", ratingId.toString()));
    }
}
