package uz.efbazaar.trade.seller.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RateSellerRequest(
        @NotNull(message = "Baho ko'rsatilishi shart")
        @Min(value = 1, message = "Minimal baho — 1")
        @Max(value = 5, message = "Maksimal baho — 5")
        Integer stars,

        @Size(max = 500, message = "Izoh 500 belgidan oshmasligi kerak")
        String comment
) {}
