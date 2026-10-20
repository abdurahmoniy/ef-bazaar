package uz.efbazaar.trade.mailbox.resource;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@Profile("!test")
@RequiredArgsConstructor
public class MailboxInventoryScheduler {
    private final MailboxInventoryService inventory;
    @Scheduled(fixedDelayString = "${trade.mailbox.inventory-dispatch-ms:30000}", initialDelayString = "${trade.mailbox.inventory-initial-delay-ms:10000}")
    public void refresh() {
        inventory.ensureRefresh();
        inventory.dispatchPending();
    }
}
