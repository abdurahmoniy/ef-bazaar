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

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
    }
}
