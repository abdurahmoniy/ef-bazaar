package uz.efbazaar.payment.plan.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A tariff a user can be on.
 *
 * <p>Carries no limits of its own. What a plan grants lives in
 * {@link PlanEntitlement}, so adding a capability never touches this table or
 * anything that reads it.
 *
 * <p>Display names are not here either — "Jaydari", "Boyvachcha", "Aristokrat"
 * are copy, and copy belongs to whoever is doing the showing.
 */
@Entity
@Table(name = "plans")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Plan {

    @Id
    @Column(length = 32)
    private String code;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
