package uz.efbazaar.trade.mailbox.release;
import lombok.RequiredArgsConstructor;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
@Component
@RequiredArgsConstructor
public class MailboxDeleteResultConsumer {
 private final MailboxDeletionService deletions;
 @KafkaListener(topics="efbazaar.trade.mailbox-delete-result",groupId="trade-service-mailbox-delete-result",
  properties={"spring.json.value.default.type=uz.efbazaar.trade.mailbox.release.MailboxDeletionService$Ack"})
 public void onResult(MailboxDeletionService.Ack result){deletions.acknowledge(result);}
}
