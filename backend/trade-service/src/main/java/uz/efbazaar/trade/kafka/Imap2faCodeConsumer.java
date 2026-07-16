package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeMessage;
import uz.efbazaar.trade.trade.domain.TradeMessageType;
import uz.efbazaar.trade.trade.domain.TradeSenderType;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;

import java.util.Map;
import java.util.UUID;

/**
 * 2FA code arrives during state 6 while B is trying to log in. We surface it
 * as a smart-admin STATUS message in the BUYER chat — no state change.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class Imap2faCodeConsumer {

    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeBroadcaster broadcaster;

    @KafkaListener(
            topics = TradeEvents.TOPIC_IMAP_2FA,
            groupId = "trade-service-imap-2fa",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$Imap2faCode"}
    )
    public void onCode(TradeEvents.Imap2faCode e) {
        var buyer = chats.findByTradeIdAndParticipant(e.tradeId(), ParticipantRole.BUYER);
        if (buyer.isEmpty()) {
            log.warn("imap-2fa for trade {} with no buyer chat", e.tradeId());
            return;
        }
        TradeMessage msg = TradeMessage.builder()
                .id(UUID.randomUUID())
                .tradeChatId(buyer.get().getId())
                .senderType(TradeSenderType.SMART_ADMIN)
                .messageType(TradeMessageType.STATUS)
                .metadata(Map.of("code", "IMAP_2FA_CODE", "value", e.code()))
                .build();
        messages.save(msg);

        TradeMessageResponse resp = new TradeMessageResponse(msg.getId(), msg.getSenderType(),
                msg.getMessageType(), null, msg.getMetadata(), msg.getCreatedAt());
        broadcaster.publishMessage(e.tradeId(), ParticipantRole.BUYER, resp);
    }
}
