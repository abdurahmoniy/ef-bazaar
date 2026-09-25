package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

/** Durable retry receipt. The message ID survives a hard delete to prevent resurrection. */
@Entity
@Table(name = "chat_message_sends", uniqueConstraints = @UniqueConstraint(
        name = "uk_chat_message_sends_key", columnNames = {"chat_id", "sender_id", "client_message_id"}))
@Getter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChatMessageSend {
    @Id @GeneratedValue private UUID id;
    @Column(name = "chat_id", nullable = false) private UUID chatId;
    @Column(name = "sender_id", nullable = false) private UUID senderId;
    @Column(name = "client_message_id", nullable = false) private UUID clientMessageId;
    @Column(name = "message_id", nullable = false) private UUID messageId;
}
