package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import uz.efbazaar.marketplace.domain.AttributeType;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AttributeDefinitionResponse(
        UUID id,
        String key,
        String labelUz,
        AttributeType type,
        boolean required,
        int position,
        String groupKey,
        JsonNode constraints,
        boolean searchable,
        boolean active,
        Instant createdAt,
        Instant updatedAt
) {}
