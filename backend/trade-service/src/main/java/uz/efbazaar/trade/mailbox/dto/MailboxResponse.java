package uz.efbazaar.trade.mailbox.dto;

import java.time.Instant;
import java.util.UUID;

public record MailboxResponse(
        UUID id,
        String email,
        UUID tradeId,
        Instant createdAt,
        Instant handedOffAt,
        boolean locked,
        /** RANDOM or CUSTOM — the frontend matches account emails against this list. */
        uz.efbazaar.trade.mailbox.domain.MailboxKind kind,
        UUID linkedAccountId,
        /** Live link session on this box, if one is running. */
        UUID activeSessionId,
        /** Null while Mailcow has not confirmed the box yet. */
        Instant provisionedAt,
        boolean slotExempt,
        boolean activeTrade,
        uz.efbazaar.trade.plan.service.MailboxAccessService.AccessState accessState,
        Instant paidExpiresAt,
        Instant graceEndsAt,
        boolean selectedForFree
) {
    public MailboxResponse(UUID id, String email, UUID tradeId, Instant createdAt, Instant handedOffAt,
                           boolean locked, uz.efbazaar.trade.mailbox.domain.MailboxKind kind,
                           UUID linkedAccountId, UUID activeSessionId, Instant provisionedAt,
                           boolean slotExempt, boolean activeTrade) {
        this(id, email, tradeId, createdAt, handedOffAt, locked, kind, linkedAccountId, activeSessionId,
                provisionedAt, slotExempt, activeTrade, null, null, null, false);
    }

    public MailboxResponse withAccess(uz.efbazaar.trade.plan.service.MailboxAccessService.Access a) {
        return new MailboxResponse(id, email, tradeId, createdAt, handedOffAt, a.locked(), kind, linkedAccountId,
                activeSessionId, provisionedAt, slotExempt, activeTrade, a.accessState(), a.paidExpiresAt(),
                a.graceEndsAt(), a.selectedForFree());
    }

    public MailboxResponse withLocked(boolean value) {
        return new MailboxResponse(id, email, tradeId, createdAt, handedOffAt, value, kind, linkedAccountId,
                activeSessionId, provisionedAt, slotExempt, activeTrade, accessState, paidExpiresAt, graceEndsAt, selectedForFree);
    }

    public MailboxResponse withActiveSession(UUID sessionId) {
        return new MailboxResponse(id, email, tradeId, createdAt, handedOffAt, locked, kind, linkedAccountId,
                sessionId, provisionedAt, slotExempt, activeTrade, accessState, paidExpiresAt, graceEndsAt, selectedForFree);
    }

    public MailboxResponse withActiveTrade(boolean value) {
        return new MailboxResponse(id, email, tradeId, createdAt, handedOffAt, locked, kind, linkedAccountId,
                activeSessionId, provisionedAt, slotExempt, value, accessState, paidExpiresAt, graceEndsAt, selectedForFree);
    }
}
