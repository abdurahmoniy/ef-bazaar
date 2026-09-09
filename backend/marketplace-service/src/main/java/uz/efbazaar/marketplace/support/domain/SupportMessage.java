package uz.efbazaar.marketplace.support.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "support_message")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SupportMessage {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "support_chat_id", nullable = false)
    private UUID supportChatId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender_type", nullable = false, length = 20)
    private SupportSenderType senderType;

    @Column(name = "sender_id")
    private UUID senderId;

    @Column(name = "sender_name", nullable = false, length = 128)
    private String senderName;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "telegram_message_id")
    private Long telegramMessageId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
