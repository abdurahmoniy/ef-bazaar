package uz.efbazaar.payment.plan.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.plan.domain.PlanPurchase;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlanPurchaseRepository extends JpaRepository<PlanPurchase, UUID> {
    Optional<PlanPurchase> findByIdempotencyKey(String idempotencyKey);
    Optional<PlanPurchase> findFirstByUserIdOrderByExpiresAtDesc(UUID userId);
    List<PlanPurchase> findByExpiresAtBetweenAndRemindedBeforeAtIsNull(Instant from, Instant to);
    List<PlanPurchase> findByExpiresAtBetweenAndRemindedExpiredAtIsNull(Instant from, Instant to);
}
