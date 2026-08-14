package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class EmailProvisionedConsumer {

    private final TradeRepository trades;
    private final TradeService tradeService;
    private final MailboxService mailboxes;

    @KafkaListener(
            topics = TradeEvents.TOPIC_EMAIL_PROVISIONED,
            groupId = "trade-service-email-provisioned",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$EmailProvisioned"}
    )
    public void onEmailProvisioned(TradeEvents.EmailProvisioned e) {
        // No class-level @Transactional here: the two mailbox writes below are
        // each @Transactional inside MailboxService, and `tradeService.transition`
        // manages its own tx. Wrapping the whole handler in a tx breaks the
        // downstream `catch (InvalidTradeTransitionException)` — Spring silently
        // marks the outer tx rollback-only when the inner tx throws, so returning
        // "normally" from the catch surfaces as UnexpectedRollbackException at
        // commit time and Kafka retries the poison record forever.
        Trade t = trades.findById(e.tradeId()).orElse(null);
        if (t == null) {
            log.warn("email-provisioned for unknown trade {}", e.tradeId());
            return;
        }
        UUID placeholderId = t.getMailboxId();
        UUID workerId = e.mailboxId();
        if (workerId == null) {
            // Legacy wire (worker built before this field existed). Fall back
            // to the placeholder id we already assigned — rotate will still
            // miss the cache, but that's the pre-fix behavior we're documenting
            // rather than a regression from this consumer.
            log.warn("email-provisioned for trade {} arrived without mailboxId; "
                    + "keeping placeholder id {} (rotate cache will miss)",
                    e.tradeId(), placeholderId);
            mailboxes.overwriteAddressAndPassword(placeholderId,
                    e.mailboxEmail(), e.encryptedPassword(), e.iv(), e.tag());
        } else {
            // adopt() also repoints trade.mailbox_id to the persisted id in its
            // own tx, so we deliberately do NOT re-save `t` here: our in-memory
            // copy is stale after adopt commits, and calling save(t) would
            // overwrite the adopt update with the pre-adopt placeholderId.
            mailboxes.adoptWorkerMailboxId(placeholderId, workerId,
                    e.mailboxEmail(), e.encryptedPassword(), e.iv(), e.tag());
        }
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
            // over — the mailbox row is still updated above either way.
            log.warn("email-provisioned for trade {} arrived after state moved on: {}",
                    e.tradeId(), ex.getMessage());
        }
    }
}
