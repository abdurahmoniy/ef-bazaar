package uz.efbazaar.trade.plan.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.plan.domain.PlanEntitlementView;
import uz.efbazaar.trade.plan.domain.PlanEntitlementViewId;

import java.util.List;
import java.util.Optional;

public interface PlanEntitlementViewRepository
        extends JpaRepository<PlanEntitlementView, PlanEntitlementViewId> {

    List<PlanEntitlementView> findByIdPlanCode(String planCode);

    Optional<PlanEntitlementView> findByIdPlanCodeAndIdKey(String planCode, String key);

    /**
     * Clears a plan's entitlements so a snapshot can replace them outright.
     *
     * <p>Applying a snapshot key by key would leave behind anything the plan
     * used to grant and no longer does — a capability nobody can take away
     * because removing it from the source stops mentioning it.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM PlanEntitlementView e WHERE e.id.planCode = :planCode")
    void deleteByPlanCode(@Param("planCode") String planCode);
}
