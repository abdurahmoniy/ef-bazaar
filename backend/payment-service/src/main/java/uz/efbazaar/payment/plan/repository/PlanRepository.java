package uz.efbazaar.payment.plan.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.plan.domain.Plan;

import java.util.List;

public interface PlanRepository extends JpaRepository<Plan, String> {

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from Plan p where p.code = :code")
    java.util.Optional<Plan> lockByCode(@org.springframework.data.repository.query.Param("code") String code);

    List<Plan> findByActiveTrueOrderBySortOrderAsc();
}
