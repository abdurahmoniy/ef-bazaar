package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Admin's own settings. The fee range is a negotiation band, not a price:
 * the per-trade amount is agreed inside it and paid off-platform.
 */
public record TradeAdminProfileUpsertRequest(

        @NotNull @Min(1)
        Long minFeeUzs,

        @NotNull @Min(1)
        Long maxFeeUzs,

        @Size(max = 500)
        String bio,

        @NotNull
        Boolean acceptingOrders,

        @NotNull @Min(1) @Max(20)
        Integer maxConcurrentTrades
) {
    /** Cross-field rule the annotations cannot express. */
    public boolean isRangeValid() {
        return minFeeUzs != null && maxFeeUzs != null && maxFeeUzs >= minFeeUzs;
    }
}
