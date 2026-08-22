package uz.efbazaar.trade.plan.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.plan.domain.UserPlanView;

import java.util.UUID;

public interface UserPlanViewRepository extends JpaRepository<UserPlanView, UUID> {
}
