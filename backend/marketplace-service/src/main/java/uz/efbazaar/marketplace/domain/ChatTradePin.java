package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * One row per (chat, trade) pin request. {@code chats.system_important} is
 * derived from this table — "does any row for this chat have pinned = true"
 * — rather than being written directly, because a chat can host more than
 * one trade over its life and an absolute flag would let one trade's close
 * unpin a chat another trade is still using.
 */
@Entity
@Table(name = "chat_trade_pins",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_chat_trade_pins_chat_trade", columnNames = {"chat_id", "trade_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatTradePin {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    @Column(name = "trade_id", nullable = false)
    private UUID tradeId;

    @Column(nullable = false)
    private boolean pinned;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;
}
