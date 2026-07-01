package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Listing entity. Gameplay-specific fields (division, coins, team strength,
 * valuable players, google play link, etc.) live in {@link #attributes} JSONB
 * and are validated against {@link AttributeDefinition} at write time. Only
 * transactional/system fields stay as typed columns.
 */
@Entity
@Table(name = "listings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Listing {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "seller_id", nullable = false)
    private UUID sellerId;

    @Column(nullable = false, columnDefinition = "text")
    private String description;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal price;

    @Column(name = "is_price_negotiable", nullable = false)
    private boolean priceNegotiable;

    /**
     * Dynamic attribute payload — keys must match active
     * {@link AttributeDefinition#getKey()}. Values are validated against the
     * corresponding definition (type + constraints) by the service layer.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> attributes = new HashMap<>();

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "media_message_ids", columnDefinition = "text[]")
    @Builder.Default
    private List<String> mediaMessageIds = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private ListingStatus status = ListingStatus.ACTIVE;

    @Column(name = "forward_count", nullable = false)
    @Builder.Default
    private int forwardCount = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (status == null) status = ListingStatus.ACTIVE;
        if (attributes == null) attributes = new HashMap<>();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
