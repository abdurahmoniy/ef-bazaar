package uz.efbazaar.marketplace.mapper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.Named;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.dto.AttributeDefinitionCreateRequest;
import uz.efbazaar.marketplace.dto.AttributeDefinitionResponse;
import uz.efbazaar.marketplace.dto.AttributeDefinitionUpdateRequest;

@Mapper(componentModel = "spring")
public interface AttributeDefinitionMapper {

    AttributeDefinitionResponse toResponse(AttributeDefinition entity);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "active", constant = "true")
    @Mapping(target = "searchable", source = "searchable", qualifiedByName = "defaultSearchable")
    @Mapping(target = "constraints", source = "constraints", qualifiedByName = "defaultConstraints")
    AttributeDefinition toEntity(AttributeDefinitionCreateRequest request);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "key", ignore = true)               // immutable
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "active", source = "active", qualifiedByName = "defaultActive")
    @Mapping(target = "searchable", source = "searchable", qualifiedByName = "defaultSearchable")
    @Mapping(target = "constraints", source = "constraints", qualifiedByName = "defaultConstraints")
    void update(@MappingTarget AttributeDefinition entity, AttributeDefinitionUpdateRequest request);

    @Named("defaultSearchable")
    default boolean defaultSearchable(Boolean value) {
        return value == null || value;
    }

    @Named("defaultActive")
    default boolean defaultActive(Boolean value) {
        return value == null || value;
    }

    @Named("defaultConstraints")
    default JsonNode defaultConstraints(JsonNode value) {
        return value == null ? JsonNodeFactory.instance.objectNode() : value;
    }
}
