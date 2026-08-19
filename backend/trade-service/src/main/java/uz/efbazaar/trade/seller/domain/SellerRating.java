package uz.efbazaar.trade.seller.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * 1–5 star rating of a seller submitted by a buyer after a successful trade.
 */
@Entity
@Table(name = "seller_ratings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SellerRating {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trade_id", nullable = false, updatable = false)
    private UUID tradeId;

    @Column(name = "seller_id", nullable = false, updatable = false)
    private UUID sellerId;

    @Column(name = "rater_id", nullable = false, updatable = false)
    private UUID raterId;

    @Column(name = "stars", nullable = false)
    private short stars;

    @Column(name = "comment", length = 500)
    private String comment;

    /** Set when a platform admin hides abusive text. The stars still count in average. */
    @Column(name = "hidden_at")
    private Instant hiddenAt;

    @Column(name = "hidden_by")
    private UUID hiddenBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public boolean isHidden() {
        return hiddenAt != null;
    }
}
