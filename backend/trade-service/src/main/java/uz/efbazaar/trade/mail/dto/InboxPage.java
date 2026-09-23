package uz.efbazaar.trade.mail.dto;

import java.util.List;

/**
 * Paginated inbox slice. `total` is the number of messages visible to the caller — not just the messages in this page. `limit` / `offset` echo the
 * request so the frontend can render the correct pagination controls.
 */
public record InboxPage(
        List<InboxMessage> messages,
        int total,
        int limit,
        int offset
) {}
