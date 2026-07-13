package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.mailbox.service.MailboxService;

@Slf4j
@Component
@RequiredArgsConstructor
public class MailboxRotatedConsumer {

    private final MailboxService mailboxes;

    @KafkaListener(
            topics = TradeEvents.TOPIC_MAILBOX_ROTATED,
            groupId = "trade-service-mailbox-rotated",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$MailboxRotated"}
    )
    public void onRotated(TradeEvents.MailboxRotated e) {
        // email == null keeps the current address; rotation only replaces the password.
        mailboxes.overwriteAddressAndPassword(e.mailboxId(), null,
                e.encryptedPassword(), e.iv(), e.tag());
    }
}
