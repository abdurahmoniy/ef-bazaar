package uz.efbazaar.trade.admin.domain;

import jakarta.persistence.*;
import lombok.*;
import uz.efbazaar.trade.trade.domain.ParticipantRole;

import java.time.Instant;
import java.util.UUID;

/** One party's 1–5 star verdict on the admin who ran their trade. */
@Entity
@Table(name = "trade_admin_ratings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeAdminRating {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trade_id", nullable = false, updatable = false)
    private UUID tradeId;

    @Column(name = "admin_id", nullable = false, updatable = false)
    private UUID adminId;

    @Column(name = "rater_id", nullable = false, updatable = false)
    private UUID raterId;

    @Enumerated(EnumType.STRING)
    @Column(name = "rater_role", nullable = false, length = 8, updatable = false)
    private ParticipantRole raterRole;

    @Column(name = "stars", nullable = false)
    private short stars;

    @Column(name = "comment", length = 500)
    private String comment;

    /** Set when a platform admin hides abusive text. The stars still count. */
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
