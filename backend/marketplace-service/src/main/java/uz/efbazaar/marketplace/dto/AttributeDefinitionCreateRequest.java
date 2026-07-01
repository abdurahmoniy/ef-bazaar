package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import uz.efbazaar.marketplace.domain.AttributeType;

public record AttributeDefinitionCreateRequest(
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = "^[a-z][a-z0-9_]{0,63}$",
                 message = "key faqat kichik harflar/raqamlar/pastki chiziq va harfdan boshlanishi kerak")
        String key,

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

        /** Free-form; interpreted per type. Null/empty allowed. */
        JsonNode constraints,

        Boolean searchable
) {}
