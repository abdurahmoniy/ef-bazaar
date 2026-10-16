package uz.efbazaar.trade.mailbox.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Admin request to register a brand-new mailbox and link it to a user.
 *
 * <p>{@code localPart} is the part before the {@code @} — Mailcow rejects
 * anything outside this charset, and we reject it here first so a bad request
 * fails synchronously instead of dying inside the worker.
 */
public record CreateMailboxRequest(

        @NotNull
        @Size(min = 3, max = 48)
        @Pattern(regexp = "^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$",
                message = "localPart must be lowercase letters, digits, dot, dash or underscore")
        String localPart,

        @NotNull
        UUID ownerUserId,

        /** One of {@code trade.mailbox.domains}; null means the default. */
        @Size(max = 64)
        String domain
) {}
