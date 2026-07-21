package uz.efbazaar.marketplace.trust;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public final class TrustRepositories {

    private TrustRepositories() {}

    public interface ComplaintRepository extends JpaRepository<Complaint, UUID> {

        Page<Complaint> findByStatusOrderByCreatedAtDesc(Complaint.Status status, Pageable pageable);

        long countByAccusedIdAndStatus(UUID accusedId, Complaint.Status status);

        long countByComplainantIdAndStatus(UUID complainantId, Complaint.Status status);

        List<Complaint> findByAccusedIdAndStatus(UUID accusedId, Complaint.Status status);
    }

    public interface PenaltyRepository extends JpaRepository<Penalty, UUID> {

        List<Penalty> findByUserIdAndStatus(UUID userId, Penalty.Status status);

        Page<Penalty> findByStatusAndTypeInOrderByCreatedAtDesc(
                Penalty.Status status, List<Penalty.Type> types, Pageable pageable);

        List<Penalty> findByStatusAndTypeAndExpiresAtBefore(
                Penalty.Status status, Penalty.Type type, java.time.Instant cutoff);
    }

    public interface BlacklistIdentifierRepository extends JpaRepository<BlacklistIdentifier, UUID> {

        List<BlacklistIdentifier> findByTypeAndValue(BlacklistIdentifier.Type type, String value);

        List<BlacklistIdentifier> findByPenaltyIdIn(List<UUID> penaltyIds);
    }
}
