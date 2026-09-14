package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.NotNull;
import uz.efbazaar.trade.trade.domain.ParticipantRole;

/** An admin confirming Konami's verification mail reached this party's mailbox. */
public record AdminKonamiConfirmRequest(@NotNull ParticipantRole role) {}
