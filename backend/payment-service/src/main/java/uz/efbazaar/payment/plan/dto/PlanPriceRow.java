package uz.efbazaar.payment.plan.dto;

import uz.efbazaar.payment.plan.domain.PlanPeriod;
import uz.efbazaar.payment.plan.domain.PlanPrice;

import java.time.Instant;
import java.util.UUID;

public record PlanPriceRow(String planCode, PlanPeriod period, long priceTiyin,
                           UUID updatedBy, Instant updatedAt) {
    public static PlanPriceRow of(PlanPrice p) {
        return new PlanPriceRow(p.getId().getPlanCode(), p.getId().getPeriod(),
                p.getPriceTiyin(), p.getUpdatedBy(), p.getUpdatedAt());
    }
}
