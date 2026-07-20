package uz.efbazaar.marketplace.gamer;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

/**
 * Small single-purpose repositories for the gamer package, grouped in one
 * file — none of them is referenced outside this package's consumers/service.
 */
public final class GamerRepositories {

    private GamerRepositories() {}

    public interface GamerStatsRepository extends JpaRepository<GamerStats, UUID> {

        /** Consumers read-modify-write; the lock serializes redeliveries. */
        @Lock(LockModeType.PESSIMISTIC_WRITE)
        Optional<GamerStats> findWithLockByUserId(UUID userId);
    }

    public interface GamerStatsMatchRepository extends JpaRepository<GamerStatsMatch, GamerStatsMatch.Key> {

        @Query("SELECT COUNT(DISTINCT m.tournamentId) FROM GamerStatsMatch m WHERE m.key.userId = :userId")
        int countDistinctTournaments(@Param("userId") UUID userId);
    }

    public interface GamerProfileRepository extends JpaRepository<GamerProfile, UUID> {
    }
}
