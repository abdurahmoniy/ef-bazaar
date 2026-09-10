package uz.efbazaar.payment.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.payment.debit.service.ByCardDebitService;
import uz.efbazaar.payment.debit.service.ByCardDebitService.CardDebitEvent;

@Slf4j
@Component
@RequiredArgsConstructor
public class CardDebitConsumer {

    private final ByCardDebitService byCard;

    // Bare JSON from the Python humo-userbot, so the type has to be declared
    // here — without it JsonDeserializer has nothing to build and every debit
    // is dropped in silence. Same reasoning as CardCreditConsumer; read its
    // comment for the failure mode this prevents.
    @KafkaListener(
            topics = PaymentTopics.CARD_DEBIT_OBSERVED,
            groupId = "payment-service-card-debit",
            properties = {"spring.json.value.default.type=uz.efbazaar.payment.debit.service.ByCardDebitService$CardDebitEvent"})
    public void onCardDebit(CardDebitEvent event) {
        // The five NOT NULL columns of V11. commissionTiyin, cardBalanceTiyin
        // and description are all genuinely optional — the bank omits them —
        // so they are absent from this check on purpose.
        if (event == null || event.telegramMessageId() == null
                || event.cardLast4() == null || event.amountTiyin() == null
                || event.observedAt() == null || event.rawText() == null) {
            log.error("card-debit-observed with missing fields, sending to the DLT: {}", event);
            throw new MalformedCardCreditException(
                    "card-debit-observed is missing a required field: " + event);
        }
        byCard.ingest(event);
    }
}
