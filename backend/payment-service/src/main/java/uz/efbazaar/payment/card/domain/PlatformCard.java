package uz.efbazaar.payment.card.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "platform_cards")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlatformCard {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "pan_encrypted", nullable = false)
    private byte[] panEncrypted;

    @Column(name = "pan_iv", nullable = false, length = 12)
    private byte[] panIv;

    @Column(name = "pan_tag", nullable = false, length = 16)
    private byte[] panTag;

    @Column(nullable = false, length = 4)
    private String last4;

    /** Stored upper-case; the service upper-cases on write. */
    @Column(name = "holder_name", nullable = false, length = 64)
    private String holderName;

    @Column(name = "expiry_month", nullable = false)
    private short expiryMonth;

    @Column(name = "expiry_year", nullable = false)
    private short expiryYear;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CardBrand brand;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(nullable = false)
    private boolean active;

    /** Last balance the Humo bot reported. Null until the first message. */
    @Column(name = "balance_tiyin")
    private Long balanceTiyin;

    @Column(name = "balance_observed_at")
    private Instant balanceObservedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;
}
