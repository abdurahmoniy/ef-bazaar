package uz.efbazaar.marketplace.referral;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class ReferralRepositories {

    private ReferralRepositories() {}

    public interface ReferralCodeRepository extends JpaRepository<ReferralCode, UUID> {
        Optional<ReferralCode> findByCode(String code);
        boolean existsByCode(String code);
    }

    public interface ReferralRepository extends JpaRepository<Referral, UUID> {
        List<Referral> findByReferrerUserIdOrderByCreatedAtDesc(UUID referrerUserId);
        Page<Referral> findByReferrerUserIdOrderByCreatedAtDesc(UUID referrerUserId, Pageable pageable);
        long countByReferrerUserId(UUID referrerUserId);
    }

    public interface ReferralSettingsRepository extends JpaRepository<ReferralSettings, Short> {}

    public interface PendingReferralRepository extends JpaRepository<PendingReferral, Long> {}
}
