package uz.efbazaar.trade.admin.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeAdminProfileRepository extends JpaRepository<TradeAdminProfile, UUID> {

    /** Catalogue candidates before capacity filtering. Admin count is small (tens). */
    List<TradeAdminProfile> findByActiveTrueAndAcceptingOrdersTrue();

    /**
     * Row-level lock used by the capacity check when an admin accepts. Two
     * concurrent accepts serialise here, so {@code maxConcurrentTrades} cannot
     * be exceeded by a race.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM TradeAdminProfile p WHERE p.userId = :userId")
    Optional<TradeAdminProfile> findByIdForUpdate(@Param("userId") UUID userId);
}
