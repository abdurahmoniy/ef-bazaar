package uz.efbazaar.trade.admin.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileResponse;
import uz.efbazaar.trade.admin.dto.TradeAdminProfileUpsertRequest;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.security.AuthSummaryClient;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TradeAdminProfileService implements TradeAdminStats {

    private final TradeAdminProfileRepository profiles;
    private final AuthSummaryClient authSummaries;

    @Transactional
    public TradeAdminProfileResponse upsert(UUID userId, TradeAdminProfileUpsertRequest req) {
        if (!req.isRangeValid()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Maksimal haq minimaldan kichik bo'lishi mumkin emas");
        }
        TradeAdminProfile p = profiles.findById(userId)
                .orElseGet(() -> TradeAdminProfile.builder().userId(userId).build());

        p.setMinFeeUzs(req.minFeeUzs());
        p.setMaxFeeUzs(req.maxFeeUzs());
        p.setBio(req.bio());
        p.setAcceptingOrders(req.acceptingOrders());
        p.setMaxConcurrentTrades(req.maxConcurrentTrades());
        // `active` is not settable here — only auth-service's role event and a
        // platform admin change it. An admin cannot re-activate themselves
        // after losing the role.

        profiles.save(p);
        return toResponse(p);
    }

    @Transactional(readOnly = true)
    public TradeAdminProfileResponse getOwn(UUID userId) {
        return toResponse(getRaw(userId));
    }

    /** Public profile. Same shape — nothing in it is private. */
    @Transactional(readOnly = true)
    public TradeAdminProfileResponse getPublic(UUID userId) {
        return toResponse(getRaw(userId));
    }

    @Transactional(readOnly = true)
    public TradeAdminProfile getRaw(UUID userId) {
        return profiles.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Trade admin profile " + userId));
    }

    /**
     * Every check the hiring paths share: the profile exists, the admin is
     * still allowed to work, is currently taking orders, and the proposed fee
     * sits inside their advertised band.
     *
     * <p>Capacity is deliberately NOT checked here — it binds when the admin
     * accepts, not when they are invited (spec §9.5).
     */
    @Transactional(readOnly = true)
    public TradeAdminProfile requireHireable(UUID adminId, long feeUzs) {
        TradeAdminProfile p = profiles.findById(adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Bunday savdo admini topilmadi"));
        if (!p.isActive()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu admin endi savdo admini emas");
        }
        if (!p.isAcceptingOrders()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu admin hozir yangi savdo qabul qilmayapti");
        }
        if (feeUzs < p.getMinFeeUzs() || feeUzs > p.getMaxFeeUzs()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Haq %d–%d so'm oralig'ida bo'lishi kerak"
                            .formatted(p.getMinFeeUzs(), p.getMaxFeeUzs()));
        }
        return p;
    }

    /** Called by the auth role-changed consumer (Task 7). Idempotent. */
    @Transactional
    public void deactivate(UUID userId) {
        profiles.findById(userId).ifPresent(p -> {
            if (p.isActive()) {
                p.setActive(false);
                profiles.save(p);
                log.info("Deactivated trade admin profile {} — role revoked", userId);
            }
        });
    }

    /** Called when auth-service reports the role was granted back. Idempotent. */
    @Transactional
    public void reactivate(UUID userId) {
        profiles.findById(userId).ifPresent(p -> {
            if (!p.isActive()) {
                p.setActive(true);
                profiles.save(p);
                log.info("Reactivated trade admin profile {} — role granted", userId);
            }
        });
    }

    // ----- TradeAdminStats -----

    @Override
    @Transactional
    public void recordCompleted(UUID adminId, long workSeconds, long closeSeconds) {
        profiles.findById(adminId).ifPresent(p -> {
            p.setCompletedCount(p.getCompletedCount() + 1);
            p.setTotalWorkSeconds(p.getTotalWorkSeconds() + Math.max(0, workSeconds));
            p.setTotalCloseSeconds(p.getTotalCloseSeconds() + Math.max(0, closeSeconds));
            profiles.save(p);
        });
    }

    @Override
    @Transactional
    public void recordAbandoned(UUID adminId) {
        profiles.findById(adminId).ifPresent(p -> {
            p.setAbandonedCount(p.getAbandonedCount() + 1);
            profiles.save(p);
        });
    }

    @Override
    @Transactional
    public void recordCancelled(UUID adminId) {
        profiles.findById(adminId).ifPresent(p -> {
            p.setCancelledCount(p.getCancelledCount() + 1);
            profiles.save(p);
        });
    }

    @Override
    @Transactional
    public void recordRating(UUID adminId, int stars) {
        profiles.findById(adminId).ifPresent(p -> {
            p.setRatingSum(p.getRatingSum() + stars);
            p.setRatingCount(p.getRatingCount() + 1);
            profiles.save(p);
        });
    }

    private TradeAdminProfileResponse toResponse(TradeAdminProfile p) {
        String name = authSummaries.resolve(p.getUserId())
                .map(AuthSummaryClient.UserSummary::displayName)
                .orElse(null);
        return TradeAdminProfileResponse.of(p, name);
    }
}
