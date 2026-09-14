package uz.efbazaar.trade.admin.dto;

import uz.efbazaar.trade.trade.domain.ParticipantRole;

import java.time.Instant;
import java.util.UUID;

/**
 * One party's progress through the worker-driven steps.
 *
 * @param mailboxId          null when this party moves no account (a sale's buyer)
 * @param mailboxProvisioned false while Mailcow has not confirmed the box — its
 *                           inbox cannot be opened yet
 */
public record AdminSmartTradeSide(
        ParticipantRole role,
        UUID mailboxId,
        String mailboxEmail,
        boolean mailboxProvisioned,
        String emailChangeCode,
        Instant emailChangeCodeAt,
        Instant emailChangedAt,
        Instant konamiVerifiedAt) {}
