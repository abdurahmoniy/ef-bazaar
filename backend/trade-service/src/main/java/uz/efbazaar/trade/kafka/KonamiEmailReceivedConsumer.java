package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.service.TradeService;

@Slf4j
@Component
@RequiredArgsConstructor
public class KonamiEmailReceivedConsumer {

    private final TradeService trades;

    @KafkaListener(
            topics = TradeEvents.TOPIC_KONAMI_EMAIL,
            groupId = "trade-service-konami-email",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$KonamiEmailReceived"}
    )
    public void onKonamiEmail(TradeEvents.KonamiEmailReceived e) {
        if (!e.resetLinkPresent()) {
            log.info("konami-email-received (no reset link) for trade {}, keeping state 4",
                    e.tradeId());
            return;
        }
        trades.transition(e.tradeId(), TradeEvent.KONAMI_EMAIL_RECEIVED,
                ActorType.WORKER, null);
    }
}
