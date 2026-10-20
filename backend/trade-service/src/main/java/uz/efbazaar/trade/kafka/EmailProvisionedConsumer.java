package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.service.TradeService;


@Slf4j
@Component
@RequiredArgsConstructor
public class EmailProvisionedConsumer {

    private final TradeService tradeService;

    @KafkaListener(
            topics = TradeEvents.TOPIC_EMAIL_PROVISIONED,
            groupId = "trade-service-email-provisioned",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$EmailProvisioned"}
    )
    public void onEmailProvisioned(TradeEvents.EmailProvisioned e) {
        if (e == null || e.tradeId() == null) return;
        // Keep recording and transition in separate transactions: a rejected
        // transition marks its transaction rollback-only, even when caught here.
        // The recording helper serializes with failure transitions, validates
        // the actual RANDOM trade side, and preserves newer rotated passwords.
        if (!tradeService.recordProvisionedMailbox(e.tradeId(), e.mailboxId(), e.mailboxEmail(),
                e.encryptedPassword(), e.iv(), e.tag(), e.claimId())) return;
        try {
            var afterMailbox = tradeService.transition(e.tradeId(), TradeEvent.MAILBOX_PROVISIONED,
                    ActorType.WORKER, null);
            // WAITING_PAYMENT used to wait for the buyer to click "TO'LOV
            // QILDIM" for a payment that happened off-platform. A SMART trade's
            // money is now frozen at the moment the proposal is accepted, so
            // there is nothing left to confirm: the state is passed through
            // immediately and the UI reports it as "money is with the platform"
            // rather than asking for an action nobody has to take.
            if (afterMailbox.getMode() == TradeMode.SMART
                    && afterMailbox.getState() == TradeState.WAITING_PAYMENT) {
                tradeService.transition(e.tradeId(), TradeEvent.PAYMENT_CONFIRMED,
                        ActorType.SYSTEM, null);
            }
        } catch (InvalidTradeTransitionException ex) {
            // Kafka is at-least-once; the trade may have already moved past
            // INITIATED (e.g. a caller drove the transition directly, or this
            // is a redelivery). Not a failure worth crash-looping the listener
            // over — the known provisioning success was already recorded safely.
            log.warn("email-provisioned for trade {} arrived after state moved on: {}",
                    e.tradeId(), ex.getMessage());
        }
    }
}
