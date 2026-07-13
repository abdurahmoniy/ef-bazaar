package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

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
        Trade t = trades.findById(e.tradeId()).orElse(null);
        if (t == null) {
            log.warn("email-provisioned for unknown trade {}", e.tradeId());
            return;
        }
        mailboxes.overwriteAddressAndPassword(t.getMailboxId(),
                e.mailboxEmail(), e.encryptedPassword(), e.iv(), e.tag());
        tradeService.transition(e.tradeId(), TradeEvent.MAILBOX_PROVISIONED,
                ActorType.WORKER, null);
    }
}
