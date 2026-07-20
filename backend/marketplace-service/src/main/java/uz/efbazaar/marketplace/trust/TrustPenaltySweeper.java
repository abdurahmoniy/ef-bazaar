package uz.efbazaar.marketplace.trust;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.trust.TrustRepositories.PenaltyRepository;

import java.time.Instant;
import java.util.List;

/**
 * Expires TEMP_BLOCK penalties whose window has passed: flips the status,
 * restores the user's BLOCKED listings and publishes user-unblacklisted.
 * BlacklistGuard already stops counting an expired block immediately, so the
 * sweep interval only affects how quickly the catalog reappears — 5 minutes
 * matches the chat expiration scheduler's cadence.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TrustPenaltySweeper {

    private final PenaltyRepository penalties;
    private final TrustService trustService;

    @Scheduled(fixedDelayString = "${app.trust.expire-check-interval-ms:300000}",
            initialDelayString = "${app.trust.expire-check-initial-delay-ms:60000}")
    public void sweep() {
        Instant now = Instant.now();
        List<Penalty> expired = penalties.findByStatusAndTypeAndExpiresAtBefore(
                Penalty.Status.ACTIVE, Penalty.Type.TEMP_BLOCK, now);
        for (Penalty p : expired) {
            trustService.expirePenalty(p.getId());
        }
        if (!expired.isEmpty()) {
            log.info("Trust sweep: expired {} TEMP_BLOCK penalties", expired.size());
        }
    }
}
