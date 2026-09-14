package uz.efbazaar.trade.mailbox.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** The user an admin hands a mailbox to. */
public record ReassignMailboxRequest(@NotNull UUID ownerUserId) {}
