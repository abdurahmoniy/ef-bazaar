package uz.efbazaar.payment.wallet.dto;

import uz.efbazaar.payment.wallet.domain.TradeCommissionConfig;

import java.time.Instant;
import java.util.UUID;

public record TradeCommissionConfigResponse(
        String id,
        long bandSom,
        double lowRatePercent,
        double highRatePercent,
        long lowMinSom,
        long highMinSom,
        boolean active,
        Instant updatedAt,
        UUID updatedBy
) {
    public static TradeCommissionConfigResponse of(TradeCommissionConfig c) {
        return new TradeCommissionConfigResponse(
                c.getId(),
                c.getBandSom(),
                c.getLowRatePercent(),
                c.getHighRatePercent(),
                c.getLowMinSom(),
                c.getHighMinSom(),
                c.isActive(),
                c.getUpdatedAt(),
                c.getUpdatedBy()
        );
    }
}
