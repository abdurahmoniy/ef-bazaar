package uz.efbazaar.trade.mailbox.resource;

import lombok.RequiredArgsConstructor;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MailboxInventoryConsumer {
    private final MailboxInventoryService inventory;
    @KafkaListener(topics = MailboxInventoryEvents.OBSERVED, groupId = "trade-service-mailbox-inventory",
        properties = {"spring.json.value.default.type=uz.efbazaar.trade.mailbox.resource.MailboxInventoryEvents$Observed"})
    public void observe(MailboxInventoryEvents.Observed event) { inventory.observe(event); }
}
