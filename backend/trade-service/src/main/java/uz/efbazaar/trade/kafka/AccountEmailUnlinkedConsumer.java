package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;

/**
 * Marketplace dropped a local account-email link; resource responsibility stays intact.
 *
 * <p>Clears the link only while it still names that account, so a replay, or
 * an event racing a newer link, cannot free a box somebody just linked.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AccountEmailUnlinkedConsumer {

    private final MailboxRepository mailboxes;

    @KafkaListener(
            topics = TradeEvents.TOPIC_ACCOUNT_EMAIL_UNLINKED,
            groupId = "trade-service-account-email-unlinked",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$AccountEmailUnlinked",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onUnlinked(TradeEvents.AccountEmailUnlinked e) {
        if (e == null || e.mailboxId() == null || e.accountId() == null) return;
        if (mailboxes.clearLinkedAccount(e.mailboxId(), e.accountId()) > 0) {
            log.info("Mailbox {} link cleared: account {} unlinked ({})", e.mailboxId(), e.accountId(), e.reason());
        }
    }
}
