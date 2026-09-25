package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chat_messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatMessage {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    @Column(name = "sender_id", nullable = false)
    private UUID senderId;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "client_message_id")
    private UUID clientMessageId;

    // ----- optional attachment (bytes live in Telegram; see V12) -----

    @Enumerated(EnumType.STRING)
    @Column(name = "attachment_type", length = 16)
    private AttachmentType attachmentType;

    @Column(name = "attachment_file_id", length = 256)
    private String attachmentFileId;

    @Column(name = "attachment_name", length = 255)
    private String attachmentName;

    @Column(name = "attachment_mime", length = 128)
    private String attachmentMime;

    @Column(name = "attachment_size")
    private Long attachmentSize;

    /** Telegram-style quote; nulled by the DB when the quoted message is deleted. */
    @Column(name = "reply_to_id")
    private UUID replyToId;

    @Column(name = "edited_at")
    private Instant editedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", nullable = false, length = 24)
    @Builder.Default
    private ChatMessageType messageType = ChatMessageType.TEXT;

    /** Non-null only when messageType = TRADE_PROPOSAL. Correlates to trade-service proposal. */
    @Column(name = "proposal_id")
    private UUID proposalId;

    /** PENDING at insert; flips to ACCEPTED/REJECTED/EXPIRED when trade-service emits the resolution event. */
    @Column(name = "proposal_outcome", length = 16)
    private String proposalOutcome;

    @Column(name = "proposal_kind", length = 24)
    private String proposalKind;

    @Column(name = "proposal_listing_id")
    private UUID proposalListingId;

    @Column(name = "proposal_expires_at")
    private Instant proposalExpiresAt;

    @Column(name = "proposal_trade_id")
    private UUID proposalTradeId;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (messageType == null) {
            messageType = ChatMessageType.TEXT;
        }
    }
}
