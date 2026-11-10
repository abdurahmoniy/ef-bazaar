package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Foydalanuvchi rozi bo'lgan oferta va maxfiylik siyosati versiyasi (YYYY-MM-DD). */
public record TermsAcceptanceRequest(
        @NotNull
        @Pattern(regexp = "\\d{4}-\\d{2}-\\d{2}", message = "Versiya YYYY-MM-DD ko'rinishida bo'lishi kerak")
        String version
) {}
