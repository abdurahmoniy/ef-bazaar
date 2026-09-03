package uz.efbazaar.marketplace.referral;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Referal mukofoti — bitta qatorli sozlama jadvali. */
@Entity
@Table(name = "referral_settings")
@Getter
@Setter
@NoArgsConstructor
public class ReferralSettings {

    public static final short SINGLETON_ID = 1;

    @Id
    @Column(nullable = false, updatable = false)
    private Short id = SINGLETON_ID;

    @Column(name = "reward_som", nullable = false)
    private BigDecimal rewardSom;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by", columnDefinition = "uuid")
    private UUID updatedBy;
}
