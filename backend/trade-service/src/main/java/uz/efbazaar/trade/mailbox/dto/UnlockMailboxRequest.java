package uz.efbazaar.trade.mailbox.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record UnlockMailboxRequest(@NotNull UUID lockInsteadId) {}
