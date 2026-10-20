package uz.efbazaar.payment.plan.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Which plan a user is on.
 *
 * <p>No row means STANDARD. That is what keeps this table small and spares
 * every existing and future user a backfill: being on the free plan is the
 * absence of a decision, not a decision.
 */
@Entity
@Table(name = "user_subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserSubscription {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "plan_code", length = 32, nullable = false)
    private String planCode;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    /** Null means it does not run out. */
    @Column(name = "expires_at")
    private Instant expiresAt;

    /** Historical paid end survives Free/STAFF transitions; never grants paid capabilities. */
    @Column(name = "last_paid_expires_at")
    private Instant lastPaidExpiresAt;

    @Column(length = 32, nullable = false)
    private String source;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void onWrite() {
        Instant now = Instant.now();
        if (startedAt == null) startedAt = now;
        if (source == null) source = "ADMIN";
        updatedAt = now;
    }

    /** Whether this subscription still applies at {@code at}. */
    public boolean isLiveAt(Instant at) {
        return expiresAt == null || expiresAt.isAfter(at);
    }
}
