package uz.efbazaar.marketplace.repository;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.marketplace.domain.ProposalMessageResolution;
import java.util.UUID;

public interface ProposalMessageResolutionRepository extends JpaRepository<ProposalMessageResolution, UUID> {
    @Modifying
    @Query(value = "INSERT INTO proposal_message_resolutions (proposal_id) VALUES (:id) ON CONFLICT DO NOTHING", nativeQuery = true)
    void ensureExists(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ProposalMessageResolution r WHERE r.proposalId = :id")
    ProposalMessageResolution lockByProposalId(@Param("id") UUID id);
}
