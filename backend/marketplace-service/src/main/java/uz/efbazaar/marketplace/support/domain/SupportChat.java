package uz.efbazaar.marketplace.support.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "support_chat")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SupportChat {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private SupportCategory category;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private SupportChatStatus status = SupportChatStatus.OPEN;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "guest_session_id", length = 64)
    private String guestSessionId;

    @Column(name = "sender_name", nullable = false, length = 128)
    private String senderName;

    @Column(name = "sender_contact", length = 128)
    private String senderContact;

    @Column(name = "telegram_topic_id")
    private Integer telegramTopicId;

    @Column(name = "telegram_root_message_id")
    private Long telegramRootMessageId;

    @Column(name = "last_message_at", nullable = false)
    private Instant lastMessageAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (lastMessageAt == null) {
            lastMessageAt = now;
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
