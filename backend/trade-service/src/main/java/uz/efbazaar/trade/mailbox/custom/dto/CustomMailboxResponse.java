package uz.efbazaar.trade.mailbox.custom.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * One of the user's custom boxes.
 *
 * @param linkedAccountId marketplace account verified on it; null = free
 * @param activeSessionId live link session, if one is running
 */
public record CustomMailboxResponse(
        UUID id,
        String email,
        boolean provisioned,
        boolean locked,
        UUID linkedAccountId,
        UUID activeSessionId,
        Instant createdAt) {}
