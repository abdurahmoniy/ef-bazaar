package uz.efbazaar.trade.mailbox.resource;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MailboxInventoryEvents {
    private MailboxInventoryEvents() {}
    public static final String REQUEST = "efbazaar.trade.mailbox-inventory-request";
    public static final String OBSERVED = "efbazaar.trade.mailbox-inventory-observed";
    public record Request(UUID requestId, List<String> domains) {}
    public record Entry(String mailboxEmail, Long usedBytes, Long quotaBytes, Boolean active) {}
    public record Observed(UUID requestId, Instant observedAt, Integer page, Boolean lastPage,
                           Boolean success, String error, List<Entry> mailboxes) {}
}
