package uz.efbazaar.trade.admin.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;

import java.util.List;
import java.util.UUID;

public interface TradeAdminProfileRepository extends JpaRepository<TradeAdminProfile, UUID> {

    /** Catalogue candidates before capacity filtering. Admin count is small (tens). */
    List<TradeAdminProfile> findByActiveTrueAndAcceptingOrdersTrue();
}
