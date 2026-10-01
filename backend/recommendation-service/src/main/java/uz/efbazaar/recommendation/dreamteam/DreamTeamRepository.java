package uz.efbazaar.recommendation.dreamteam;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DreamTeamRepository extends JpaRepository<DreamTeam, UUID> {

    List<DreamTeam> findByUserIdOrderByUpdatedAtDescCreatedAtDesc(UUID userId);

    Optional<DreamTeam> findFirstByUserIdOrderByUpdatedAtDescCreatedAtDesc(UUID userId);

    Optional<DreamTeam> findByIdAndUserId(UUID id, UUID userId);
}
