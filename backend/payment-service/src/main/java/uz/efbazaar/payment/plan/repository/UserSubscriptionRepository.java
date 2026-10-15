package uz.efbazaar.payment.plan.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.payment.plan.domain.UserSubscription;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserSubscriptionRepository extends JpaRepository<UserSubscription, UUID> {

    /** Subscriptions that have run out and whose owner has not been told yet. */
    List<UserSubscription> findByExpiresAtLessThanEqual(Instant at);

    /** Serialises a user's purchases: a second one waits and then sees the first. */
    @Modifying
    @Query(value = "INSERT INTO user_subscriptions (user_id, plan_code, started_at, expires_at, source, updated_at) "
            + "VALUES (:userId, 'STANDARD', now(), now(), 'SYSTEM', now()) ON CONFLICT (user_id) DO NOTHING",
            nativeQuery = true)
    void ensureRow(@Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from UserSubscription s where s.userId = :userId")
    Optional<UserSubscription> lockByUserId(@Param("userId") UUID userId);
}
