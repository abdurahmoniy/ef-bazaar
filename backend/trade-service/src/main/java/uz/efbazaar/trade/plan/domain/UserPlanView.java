package uz.efbazaar.trade.plan.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/** Local copy of which plan a user is on. No row means the default. */
@Entity
@Table(name = "user_plan_view")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserPlanView {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "plan_code", length = 32, nullable = false)
    private String planCode;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void onWrite() {
        updatedAt = Instant.now();
    }

    public boolean isLiveAt(Instant at) {
        return expiresAt == null || expiresAt.isAfter(at);
    }
}
