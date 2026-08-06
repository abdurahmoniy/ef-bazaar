package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.repository.ChatRepository;

/**
 * Holds a chat open while a trade is running inside it.
 *
 * <p>ChatExpirationScheduler closes an ACTIVE chat 24h after its last message.
 * A hand-run trade legitimately takes days and the trade panel lives in that
 * chat, so the system pins it for the duration. Applies to smart trades too —
 * they can also outlive 24h of chat silence.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeChatPinConsumer {

    private final ChatRepository chats;

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
        if (e == null || e.chatId() == null) {
            // Trades opened without a marketplace chat context are legitimate.
            return;
        }
        int updated = chats.setSystemImportant(e.chatId(), pinned);
        if (updated == 0) {
            log.warn("trade chat pin={} for unknown chat {}", pinned, e.chatId());
        }
    }
}
