package uz.efbazaar.access.requirement;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface AccessRequirementRepository extends JpaRepository<AccessRequirement, UUID> {

    List<AccessRequirement> findAllByOrderByPositionAscCreatedAtAsc();

    boolean existsByTypeAndExternalKey(RequirementType type, String externalKey);

    @Query("select coalesce(max(r.position), 0) from AccessRequirement r")
    int maxPosition();
}
