package uz.efbazaar.payment.plan.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.plan.domain.PlanEntitlement;
import uz.efbazaar.payment.plan.domain.PlanEntitlementId;

import java.util.List;

public interface PlanEntitlementRepository
        extends JpaRepository<PlanEntitlement, PlanEntitlementId> {

    List<PlanEntitlement> findByIdPlanCode(String planCode);
}
