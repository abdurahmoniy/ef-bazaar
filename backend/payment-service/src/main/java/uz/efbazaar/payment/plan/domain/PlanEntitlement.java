package uz.efbazaar.payment.plan.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One thing a plan grants, as a named value.
 *
 * <p>{@code mailbox.slots = 3}. The value is text because the next entitlement
 * will be a percentage or a flag, and a column per shape is how a table grows
 * to twenty columns nobody dares change.
 *
 * <p>A null value means unlimited — deliberately not {@code -1}, which every
 * comparison that forgets about it reads as "none at all".
 */
@Entity
@Table(name = "plan_entitlements")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlanEntitlement {

    @EmbeddedId
    private PlanEntitlementId id;

    @Column(length = 64)
    private String value;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void onWrite() {
        updatedAt = Instant.now();
    }

    public String planCode() {
        return id.getPlanCode();
    }

    public String key() {
        return id.getKey();
    }
}
