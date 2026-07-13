package uz.efbazaar.trade.trade.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "trade_messages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeMessage {

    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "trade_chat_id", nullable = false, updatable = false)
    private UUID tradeChatId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender_type", nullable = false, length = 16, updatable = false)
    private TradeSenderType senderType;

    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", nullable = false, length = 24, updatable = false)
    private TradeMessageType messageType;

    /** May be null for STATUS / BUTTON_PROMPT with no user text. */
    @Column(name = "encrypted_body")
    private byte[] encryptedBody;

    @Column(name = "iv", length = 12)
    private byte[] iv;

    @Column(name = "tag", length = 16)
    private byte[] tag;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
