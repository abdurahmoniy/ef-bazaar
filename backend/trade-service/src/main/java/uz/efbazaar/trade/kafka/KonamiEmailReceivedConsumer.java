package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
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
        try {
            trades.transition(e.tradeId(), TradeEvent.KONAMI_EMAIL_RECEIVED,
                    ActorType.WORKER, null);
        } catch (InvalidTradeTransitionException ex) {
            // Kafka is at-least-once; the trade may have already moved past
            // VERIFYING_KONAMI_LINK (e.g. a caller drove the transition
            // directly, or this is a redelivery/duplicate IMAP hit). Not a
            // failure worth crash-looping the listener over.
            log.warn("konami-email-received for trade {} arrived after state moved on: {}",
                    e.tradeId(), ex.getMessage());
        }
    }
}
