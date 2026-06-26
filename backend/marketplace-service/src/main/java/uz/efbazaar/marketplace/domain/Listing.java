package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

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

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "valuable_players", columnDefinition = "text[]")
    @Builder.Default
    private List<String> valuablePlayers = new ArrayList<>();

    @Column(name = "has_google_play_link", nullable = false)
    private boolean hasGooglePlayLink;

    @Min(1) @Max(9)
    @Column(name = "highest_division_level", nullable = false)
    private int highestDivisionLevel;

    @PositiveOrZero
    @Column(name = "android_coins", nullable = false)
    private int androidCoins;

    @PositiveOrZero
    @Column(name = "ios_coins", nullable = false)
    private int iosCoins;

    @PositiveOrZero
    @Column(name = "team_strength", nullable = false)
    private int teamStrength;

    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal price;

    @Column(name = "is_price_negotiable", nullable = false)
    private boolean priceNegotiable;

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
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
