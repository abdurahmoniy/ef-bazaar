package uz.efbazaar.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.DreamTeam;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DreamTeamRepository extends JpaRepository<DreamTeam, UUID> {

    List<DreamTeam> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<DreamTeam> findByIdAndUserId(UUID id, UUID userId);

    long countByUserId(UUID userId);
}
