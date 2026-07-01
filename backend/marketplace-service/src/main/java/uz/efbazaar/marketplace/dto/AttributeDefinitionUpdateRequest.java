package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import uz.efbazaar.marketplace.domain.AttributeType;

/**
 * {@code key} is immutable — listings reference it. Update requests cannot
 * change the identifier; only surface metadata + constraints.
 */
public record AttributeDefinitionUpdateRequest(
        @NotBlank
        @Size(max = 255)
        String labelUz,

        @NotNull
        AttributeType type,

        boolean required,

        @PositiveOrZero
        int position,

        @Size(max = 64)
        String groupKey,

        JsonNode constraints,

        Boolean searchable,

        Boolean active
) {}
