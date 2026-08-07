package uz.efbazaar.trade.admin.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A user's willingness to run trades by hand, plus every number the catalogue
 * shows. Existence of the row is the opt-in; {@code active = false} is how a
 * revoked role is recorded without losing rating history.
 */
@Entity
@Table(name = "trade_admin_profiles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeAdminProfile {

    @Id
    @Column(name = "user_id", columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID userId;

    @Column(name = "min_fee_uzs", nullable = false)
    private long minFeeUzs;

    @Column(name = "max_fee_uzs", nullable = false)
    private long maxFeeUzs;

    @Column(name = "bio", length = 500)
    private String bio;

    @Column(name = "accepting_orders", nullable = false)
    @Builder.Default
    private boolean acceptingOrders = true;

    @Column(name = "max_concurrent_trades", nullable = false)
    @Builder.Default
    private int maxConcurrentTrades = 3;

    @Column(name = "active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "rating_sum", nullable = false)
    @Builder.Default
    private int ratingSum = 0;

    @Column(name = "rating_count", nullable = false)
    @Builder.Default
    private int ratingCount = 0;

    @Column(name = "completed_count", nullable = false)
    @Builder.Default
    private int completedCount = 0;

    @Column(name = "abandoned_count", nullable = false)
    @Builder.Default
    private int abandonedCount = 0;

    @Column(name = "cancelled_count", nullable = false)
    @Builder.Default
    private int cancelledCount = 0;

    @Column(name = "total_work_seconds", nullable = false)
    @Builder.Default
    private long totalWorkSeconds = 0;

    @Column(name = "total_close_seconds", nullable = false)
    @Builder.Default
    private long totalCloseSeconds = 0;

    /** Optimistic lock — the capacity check in Task 10 locks this row. */
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Mean stars, or {@code null} when nobody has rated yet. */
    public Double averageStars() {
        return ratingCount == 0 ? null : (double) ratingSum / ratingCount;
    }

    /** Mean seconds of the admin's own work, or {@code null} before the first close. */
    public Long averageWorkSeconds() {
        return completedCount == 0 ? null : totalWorkSeconds / completedCount;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
