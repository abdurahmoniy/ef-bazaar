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
import uz.efbazaar.trade.trade.service.TradeDeadlineExtender;
import uz.efbazaar.trade.trade.service.TradeDeadlineExtender.ExtensionOutcome;

import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkerQueuedConsumer {

    private final TradeDeadlineExtender extender;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;

    @KafkaListener(
            topics = TradeEvents.TOPIC_WORKER_QUEUED,
            groupId = "trade-service-worker-queued",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$WorkerQueued"}
    )
    public void onQueued(TradeEvents.WorkerQueued e) {
        ExtensionOutcome outcome = extender.extend(e.tradeId(), e.estimatedWaitSeconds());
        String text = switch (outcome) {
            case EXTENDED -> String.format(
                    "Smart-admin band, so'rovingiz navbatda. Muddat %d daq'ga uzaytirildi.",
                    (e.estimatedWaitSeconds() * 2 + 900) / 60);
            case CAPPED -> "Smart-admin band, so'rovingiz navbatda. Muddat qo'shimcha uzaytirilmaydi.";
            case TRADE_NOT_FOUND -> null;
            case TRADE_TERMINAL -> null;
        };
        if (text == null) {
            log.warn("worker-queued for trade {} skipped: {}", e.tradeId(), outcome);
            return;
        }
        for (ParticipantRole role : ParticipantRole.values()) {
            chats.findByTradeIdAndParticipant(e.tradeId(), role).ifPresent(chat ->
                    messages.save(TradeMessage.builder()
                            .id(UUID.randomUUID())
                            .tradeChatId(chat.getId())
                            .senderType(TradeSenderType.SMART_ADMIN)
                            .messageType(TradeMessageType.STATUS)
                            .metadata(Map.of(
                                    "code", "SMART_ADMIN_QUEUED",
                                    "purpose", e.purpose(),
                                    "outcome", outcome.name(),
                                    "text", text
                            ))
                            .build())
            );
        }
    }
}
