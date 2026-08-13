package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;

@Slf4j
@Component
@RequiredArgsConstructor
public class CardCreditConsumer {

    private final ByCardService byCard;

    // The producer is the Python humo-userbot, so records arrive as bare JSON with
    // no __TypeId__ header — without a declared default type JsonDeserializer has
    // nothing to build and every observed top-up is dropped in silence: no
    // exception, no stall, no log line, the deposit just never arrives. Same
    // pattern HeartbeatConsumer and all thirteen of trade-service's
    // smart-admin-worker listeners use. CardCreditEvent is nested, hence the $.
    @KafkaListener(
            topics = PaymentTopics.CARD_CREDIT_OBSERVED,
            groupId = "payment-service-card-credit",
            properties = {"spring.json.value.default.type=uz.efbazaar.payment.observation.service.ByCardService$CardCreditEvent"})
    public void onCardCredit(CardCreditEvent event) {
        // All five NOT NULL columns of V4, not three. observedAt and rawText
        // were unguarded, so a record missing either sailed through to
        // observations.save and died there on a constraint — and with the
        // record already consumed that top-up was simply gone.
        if (event == null || event.telegramMessageId() == null
                || event.cardLast4() == null || event.amountTiyin() == null
                || event.observedAt() == null || event.rawText() == null) {
            // Not a silent skip: see MalformedCardCreditException. The record
            // goes to the dead-letter topic so the money stays findable.
            log.error("card-credit-observed with missing fields, sending to the DLT: {}", event);
            throw new MalformedCardCreditException(
                    "card-credit-observed is missing a required field: " + event);
        }
        byCard.ingest(event);
    }
}
