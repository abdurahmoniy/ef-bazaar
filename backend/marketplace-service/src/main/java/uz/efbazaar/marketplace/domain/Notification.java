package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * In-app notification for the web notification center. One row per event per
 * recipient; unread {@code CHAT_MESSAGE} rows are reused (created_at bumped)
 * instead of inserting one per message.
 */
@Entity
@Table(name = "notifications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private NotificationType type;

    @Column(name = "chat_id")
    private UUID chatId;

    @Column(name = "listing_id")
    private UUID listingId;

    /** Set for TRADE_ADMIN_INVITED so the bell can deep-link to the trade. */
    @Column(name = "trade_id")
    private UUID tradeId;

    @Column(name = "actor_display_name", length = 64)
    private String actorDisplayName;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
