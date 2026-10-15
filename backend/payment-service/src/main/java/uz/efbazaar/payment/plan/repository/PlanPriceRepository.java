package uz.efbazaar.payment.plan.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.plan.domain.PlanPrice;
import uz.efbazaar.payment.plan.domain.PlanPriceId;

import java.util.List;

public interface PlanPriceRepository extends JpaRepository<PlanPrice, PlanPriceId> {
    List<PlanPrice> findByIdPlanCode(String planCode);
    List<PlanPrice> findAllByOrderByIdPlanCodeAscIdPeriodAsc();
}
