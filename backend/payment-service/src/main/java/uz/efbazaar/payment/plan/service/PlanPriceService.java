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
 * <p>Only Pro monthly is a sellable SKU. Legacy price rows remain for history,
 * but neither public nor admin APIs can turn them back into products.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PlanPriceService {

    private final PlanPriceRepository prices;
    private final PlanRepository plans;

    @Transactional(readOnly = true)
    public OptionalLong priceOf(String planCode, PlanPeriod period) {
        if (!isSellable(planCode, period)) return OptionalLong.empty();
        return prices.findById(new PlanPriceId(planCode, period))
                .map(p -> OptionalLong.of(p.getPriceTiyin()))
                .orElse(OptionalLong.empty());
    }

    @Transactional(readOnly = true)
    public Map<PlanPeriod, Long> pricesOf(String planCode) {
        Map<PlanPeriod, Long> out = new EnumMap<>(PlanPeriod.class);
        for (PlanPrice p : prices.findByIdPlanCode(planCode)) {
            if (isSellable(planCode, p.getId().getPeriod())) {
                out.put(p.getId().getPeriod(), p.getPriceTiyin());
            }
        }
        return out;
    }

    @Transactional(readOnly = true)
    public List<PlanPriceRow> all() {
        return prices.findAllByOrderByIdPlanCodeAscIdPeriodAsc().stream()
                .filter(p -> isSellable(p.getId().getPlanCode(), p.getId().getPeriod()))
                .map(PlanPriceRow::of).toList();
    }

    /**
     * Applies all rows or none. Product availability is not an admin price setting;
     * retired MAX/YEAR, the free plan and STAFF cannot be offered through this API.
     */
    @Transactional
    public List<PlanPriceRow> update(UUID adminId, List<UpdatePlanPricesRequest.Item> items) {
        for (var item : items) {
            if (!plans.existsById(item.planCode())
                    || !isSellable(item.planCode(), item.period())) {
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

    private static boolean isSellable(String planCode, PlanPeriod period) {
        return "PRO".equals(planCode) && period == PlanPeriod.MONTH;
    }
}
