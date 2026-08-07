package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** One party's verdict. Comment optional; shown publicly unless moderated. */
public record RateAdminRequest(
        @NotNull @Min(1) @Max(5) Integer stars,
        @Size(max = 500) String comment
) {}
