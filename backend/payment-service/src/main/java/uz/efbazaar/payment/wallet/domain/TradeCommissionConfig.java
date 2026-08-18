package uz.efbazaar.payment.wallet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "trade_commission_configs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TradeCommissionConfig {

    public static final String DEFAULT_ID = "DEFAULT";

    @Id
    @Column(name = "id", length = 32, nullable = false)
    private String id;

    @Column(name = "band_som", nullable = false)
    private long bandSom;

    @Column(name = "low_rate_percent", nullable = false)
    private double lowRatePercent;

    @Column(name = "high_rate_percent", nullable = false)
    private double highRatePercent;

    @Column(name = "low_min_som", nullable = false)
    private long lowMinSom;

    @Column(name = "high_min_som", nullable = false)
    private long highMinSom;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by", columnDefinition = "uuid")
    private UUID updatedBy;

    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }
}
