package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeMessage;
import uz.efbazaar.trade.trade.domain.TradeMessageType;
import uz.efbazaar.trade.trade.domain.TradeSenderType;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;

import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkerStartedConsumer {

    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;

    @KafkaListener(
            topics = TradeEvents.TOPIC_WORKER_STARTED,
            groupId = "trade-service-worker-started",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$WorkerStarted"}
    )
    public void onStarted(TradeEvents.WorkerStarted e) {
        String text = "Smart-admin so'rovingizni ishlab boshladi.";
        for (ParticipantRole role : ParticipantRole.values()) {
            chats.findByTradeIdAndParticipant(e.tradeId(), role).ifPresent(chat ->
                    messages.save(TradeMessage.builder()
                            .id(UUID.randomUUID())
                            .tradeChatId(chat.getId())
                            .senderType(TradeSenderType.SMART_ADMIN)
                            .messageType(TradeMessageType.STATUS)
                            .metadata(Map.of(
                                    "code", "SMART_ADMIN_STARTED",
                                    "purpose", e.purpose(),
                                    "text", text
                            ))
                            .build())
            );
        }
    }
}
