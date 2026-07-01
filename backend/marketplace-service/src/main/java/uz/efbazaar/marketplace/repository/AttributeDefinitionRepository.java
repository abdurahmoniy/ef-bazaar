package uz.efbazaar.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.AttributeDefinition;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttributeDefinitionRepository extends JpaRepository<AttributeDefinition, UUID> {

    Optional<AttributeDefinition> findByKey(String key);

    boolean existsByKey(String key);

    List<AttributeDefinition> findAllByActiveTrueOrderByPositionAsc();

    List<AttributeDefinition> findAllByOrderByPositionAsc();

    List<AttributeDefinition> findAllByGroupKeyAndActiveTrueOrderByPositionAsc(String groupKey);
}
