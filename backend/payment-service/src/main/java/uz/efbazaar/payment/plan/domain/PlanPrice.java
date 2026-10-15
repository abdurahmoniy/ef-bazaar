package uz.efbazaar.payment.plan.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/** What one period of a plan costs. Edited by admins; seeded once by V15. */
@Entity
@Table(name = "plan_prices")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PlanPrice {
    @EmbeddedId
    private PlanPriceId id;

    @Column(name = "price_tiyin", nullable = false)
    private long priceTiyin;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist @PreUpdate
    void onWrite() { updatedAt = Instant.now(); }
}
