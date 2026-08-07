package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ChatTradePinRepository;

import java.time.Instant;
import java.util.UUID;

/**
 * Holds a chat open while a trade is running inside it.
 *
 * <p>ChatExpirationScheduler closes an ACTIVE chat 24h after its last message.
 * A hand-run trade legitimately takes days and the trade panel lives in that
 * chat, so the system pins it for the duration. Applies to smart trades too —
 * they can also outlive 24h of chat silence.
 *
 * <p>A chat can host more than one trade over its life (trade-service's
 * {@code idx_trades_chat_id} is non-unique), so the pin is tracked per trade
 * in {@code chat_trade_pins} rather than as a single flag on the chat — a
 * direct setter would let one trade's close unpin a chat a second trade is
 * still using. {@code chats.system_important} is recomputed as "any pinning
 * row for this chat" after each upsert, and the upsert itself is
 * last-write-wins on {@code occurredAt} so an out-of-order or redelivered
 * event self-corrects instead of sticking.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeChatPinConsumer {

    private final ChatRepository chats;
    private final ChatTradePinRepository pins;

    @KafkaListener(
            topics = "efbazaar.trade.trade-opened",
            groupId = "marketplace-trade-chat-pin",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeChatPinDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onOpened(TradeChatPinDto e) {
        pin(e, true);
    }

    @KafkaListener(
            topics = "efbazaar.trade.trade-closed",
            groupId = "marketplace-trade-chat-pin",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeChatPinDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onClosed(TradeChatPinDto e) {
        pin(e, false);
    }

    private void pin(TradeChatPinDto e, boolean pinned) {
        if (e == null || e.chatId() == null || e.tradeId() == null) {
            // Trades opened without a marketplace chat context are legitimate.
            return;
        }
        if (!chats.existsById(e.chatId())) {
            log.warn("trade chat pin={} for unknown chat {}", pinned, e.chatId());
            return;
        }
        Instant occurredAt = e.occurredAt() != null ? e.occurredAt() : Instant.now();
        pins.upsert(UUID.randomUUID(), e.chatId(), e.tradeId(), pinned, occurredAt);
        chats.recomputeSystemImportant(e.chatId());
    }
}
