package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import uz.efbazaar.trade.trade.domain.ParticipantRole;

/**
 * An admin typing in the Konami email-change code they read from the escrow
 * mailbox, because the worker could not.
 *
 * @param role whose mailbox it came from — on a swap each party gets their own
 *             code, and the other party's is useless to them
 */
public record AdminEmailChangeCodeRequest(
        @NotNull ParticipantRole role,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "Kod 6 ta raqamdan iborat bo'lishi kerak")
        String code) {}
