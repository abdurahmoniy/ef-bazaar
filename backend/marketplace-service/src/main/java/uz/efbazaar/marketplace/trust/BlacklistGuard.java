package uz.efbazaar.marketplace.trust;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.trust.TrustRepositories.PenaltyRepository;

import java.time.Instant;
import java.util.UUID;

/**
 * Hot-path blacklist check used by write flows (listing create, chat start)
 * and the Gamer Card. Pure read — an expired TEMP_BLOCK simply stops
 * counting; the status flip + listing restoration is done by
 * {@link TrustPenaltySweeper} so this stays safe inside read-only
 * transactions.
 */
@Component
@RequiredArgsConstructor
public class BlacklistGuard {

    private final PenaltyRepository penalties;

    @Transactional(readOnly = true)
    public boolean isBlacklisted(UUID userId) {
        Instant now = Instant.now();
        return penalties.findByUserIdAndStatus(userId, Penalty.Status.ACTIVE).stream()
                .anyMatch(p -> p.blocksNow(now));
    }
}
