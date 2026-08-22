package uz.efbazaar.payment.plan.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.plan.domain.Plan;

import java.util.List;

public interface PlanRepository extends JpaRepository<Plan, String> {

    List<Plan> findByActiveTrueOrderBySortOrderAsc();
}
