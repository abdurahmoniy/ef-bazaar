package uz.efbazaar.payment.plan.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.plan.domain.UserSubscription;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface UserSubscriptionRepository extends JpaRepository<UserSubscription, UUID> {

    /** Subscriptions that have run out and whose owner has not been told yet. */
    List<UserSubscription> findByExpiresAtLessThanEqual(Instant at);
}
