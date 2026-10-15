package uz.efbazaar.payment.plan.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.plan.domain.PlanPeriod;
import uz.efbazaar.payment.plan.domain.PlanPrice;
import uz.efbazaar.payment.plan.domain.PlanPriceId;
import uz.efbazaar.payment.plan.dto.PlanPriceRow;
import uz.efbazaar.payment.plan.dto.UpdatePlanPricesRequest;
import uz.efbazaar.payment.plan.repository.PlanPriceRepository;
import uz.efbazaar.payment.plan.repository.PlanRepository;

import java.util.*;

/**
 * What plans cost. Admins edit it; nobody else writes it.
 *
 * <p>A plan with no price row is not for sale — that is how STANDARD stays free
 * without a special case in the purchase path.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanPriceService {

    private final PlanPriceRepository prices;
    private final PlanRepository plans;

    @Transactional(readOnly = true)
    public OptionalLong priceOf(String planCode, PlanPeriod period) {
        return prices.findById(new PlanPriceId(planCode, period))
                .map(p -> OptionalLong.of(p.getPriceTiyin()))
                .orElse(OptionalLong.empty());
    }

    @Transactional(readOnly = true)
    public Map<PlanPeriod, Long> pricesOf(String planCode) {
        Map<PlanPeriod, Long> out = new EnumMap<>(PlanPeriod.class);
        for (PlanPrice p : prices.findByIdPlanCode(planCode)) {
            out.put(p.getId().getPeriod(), p.getPriceTiyin());
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<PlanPriceRow> all() {
        return prices.findAllByOrderByIdPlanCodeAscIdPeriodAsc().stream().map(PlanPriceRow::of).toList();
    }

    /**
     * Applies all rows or none. STANDARD is refused: pricing the free plan would
     * make it purchasable, which is not a price change but a product change.
     * STAFF is refused for the same reason: it is the admins' plan, not a product.
     */
    @Transactional
    public List<PlanPriceRow> update(UUID adminId, List<UpdatePlanPricesRequest.Item> items) {
        for (var item : items) {
            if (!plans.existsById(item.planCode())
                    || PlanService.DEFAULT_PLAN.equals(item.planCode())
                    || PlanService.STAFF_PLAN.equals(item.planCode())) {
                throw new IllegalArgumentException("Not a purchasable plan: " + item.planCode());
            }
            var id = new PlanPriceId(item.planCode(), item.period());
            PlanPrice row = prices.findById(id).orElseGet(() -> PlanPrice.builder().id(id).build());
            row.setPriceTiyin(item.priceTiyin());
            row.setUpdatedBy(adminId);
            prices.save(row);
            log.info("Admin {} set {} {} price to {} tiyin", adminId, item.planCode(), item.period(), item.priceTiyin());
        }
        return all();
    }
}
