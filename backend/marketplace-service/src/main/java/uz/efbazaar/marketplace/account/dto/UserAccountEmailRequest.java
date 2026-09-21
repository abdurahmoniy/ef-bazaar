package uz.efbazaar.marketplace.account.dto;

import jakarta.validation.constraints.Size;

/** Bo'sh qiymat — manzilni uzish. Shuning uchun @NotBlank yo'q. */
public record UserAccountEmailRequest(@Size(max = 200) String email) {}
