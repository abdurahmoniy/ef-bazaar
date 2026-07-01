package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.dto.AttributeDefinitionCreateRequest;
import uz.efbazaar.marketplace.dto.AttributeDefinitionResponse;
import uz.efbazaar.marketplace.dto.AttributeDefinitionUpdateRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.AttributeDefinitionMapper;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;

import java.util.List;
import java.util.UUID;

/**
 * CRUD for dynamic listing attribute definitions.
 *
 * <p>Immutability rules:
 * <ul>
 *   <li>{@code key} cannot be changed after creation — historical listing values
 *       reference it. If the concept truly changed, deactivate the old key and
 *       create a new one.</li>
 *   <li>Delete is soft — flipping {@code active=false} hides the definition from
 *       public GET but keeps existing values readable.</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttributeDefinitionService {

    private final AttributeDefinitionRepository repository;
    private final AttributeDefinitionMapper mapper;

    @Transactional
    public AttributeDefinitionResponse create(AttributeDefinitionCreateRequest request) {
        if (repository.existsByKey(request.key())) {
            throw MarketplaceException.attributeKeyExists(request.key());
        }
        AttributeDefinition saved = repository.save(mapper.toEntity(request));
        log.info("Attribute definition created: key={} type={}", saved.getKey(), saved.getType());
        return mapper.toResponse(saved);
    }

    @Transactional
    public AttributeDefinitionResponse update(UUID id, AttributeDefinitionUpdateRequest request) {
        AttributeDefinition entity = getEntity(id);
        mapper.update(entity, request);
        AttributeDefinition saved = repository.save(entity);
        log.info("Attribute definition updated: key={}", saved.getKey());
        return mapper.toResponse(saved);
    }

    @Transactional
    public void softDelete(UUID id) {
        AttributeDefinition entity = getEntity(id);
        if (!entity.isActive()) return;
        entity.setActive(false);
        repository.save(entity);
        log.info("Attribute definition deactivated: key={}", entity.getKey());
    }

    @Transactional(readOnly = true)
    public List<AttributeDefinitionResponse> list(boolean includeInactive, String groupKey) {
        List<AttributeDefinition> entities;
        if (groupKey != null && !groupKey.isBlank()) {
            entities = repository.findAllByGroupKeyAndActiveTrueOrderByPositionAsc(groupKey);
        } else if (includeInactive) {
            entities = repository.findAllByOrderByPositionAsc();
        } else {
            entities = repository.findAllByActiveTrueOrderByPositionAsc();
        }
        return entities.stream().map(mapper::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public AttributeDefinitionResponse getById(UUID id) {
        return mapper.toResponse(getEntity(id));
    }

    private AttributeDefinition getEntity(UUID id) {
        return repository.findById(id).orElseThrow(MarketplaceException::attributeNotFound);
    }
}
