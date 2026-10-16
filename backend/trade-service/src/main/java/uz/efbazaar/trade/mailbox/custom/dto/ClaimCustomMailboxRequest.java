package uz.efbazaar.trade.mailbox.custom.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Format is checked by {@code CustomNamePolicy}, so the answer carries a code the screen understands. */
public record ClaimCustomMailboxRequest(
        @NotNull @Size(max = 64) String localPart,
        @Size(max = 64) String domain) {}
