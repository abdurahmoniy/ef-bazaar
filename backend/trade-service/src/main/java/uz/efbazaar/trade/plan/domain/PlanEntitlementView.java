package uz.efbazaar.trade.plan.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/** Local copy of one thing a plan grants. Written only by the Kafka consumer. */
@Entity
@Table(name = "plan_entitlement_view")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlanEntitlementView {

    @EmbeddedId
    private PlanEntitlementViewId id;

    /** Null means unlimited. */
    @Column(length = 64)
    private String value;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    @PreUpdate
    void onWrite() {
        updatedAt = Instant.now();
    }
}
