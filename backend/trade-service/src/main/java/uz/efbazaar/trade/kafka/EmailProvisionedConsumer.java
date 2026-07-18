package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
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
    @Transactional
    public void onEmailProvisioned(TradeEvents.EmailProvisioned e) {
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
            UUID persisted = mailboxes.adoptWorkerMailboxId(placeholderId, workerId,
                    e.mailboxEmail(), e.encryptedPassword(), e.iv(), e.tag());
            if (!persisted.equals(placeholderId)) {
                t.setMailboxId(persisted);
                trades.save(t);
            }
        }
        try {
            tradeService.transition(e.tradeId(), TradeEvent.MAILBOX_PROVISIONED,
                    ActorType.WORKER, null);
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
