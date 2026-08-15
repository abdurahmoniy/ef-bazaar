package uz.efbazaar.payment.withdrawal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

/**
 * The user id is never in the body — it comes from {@code X-User-Id}, because
 * it decides whose wallet is debited.
 */
public record WithdrawalCreateRequest(
        @Positive(message = "Summa musbat bo'lishi kerak")
        long amountTiyin,

        /** Digits only after the client strips spacing; length checked in the service. */
        @NotBlank(message = "Karta raqami kiritilishi shart")
        String pan,

        @NotBlank(message = "Karta egasining ismi kiritilishi shart")
        @Pattern(regexp = "[A-Za-z ']{3,64}", message = "Ism lotin harflarida bo'lishi kerak")
        String holderName,

        @NotBlank(message = "Telefon raqam kiritilishi shart")
        @Pattern(regexp = "\\+?[0-9 ()-]{7,32}", message = "Telefon raqam noto'g'ri")
        String phone,

        /**
         * Contact hint, filled by the client from the session. Not carried by
         * the nginx auth headers, and not authoritative — {@code userId} is
         * what identifies the account whose wallet is being debited.
         */
        @Size(max = 64) String telegramUsername
) {}
