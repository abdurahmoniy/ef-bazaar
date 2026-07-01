package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Typed columns (description/price/priceNegotiable) validated via Jakarta.
 * Everything else lives in {@code attributes} and is checked against the
 * active {@link uz.efbazaar.marketplace.domain.AttributeDefinition} rows by
 * {@code AttributeValidator} in the service layer.
 */
public record ListingCreateRequest(
        @NotBlank @Size(min = 10, max = 4000)
        String description,

        @NotNull @DecimalMin(value = "0.00", inclusive = true)
        BigDecimal price,

        boolean priceNegotiable,

        /**
         * Map from attribute key → value. {@code null} treated as empty (validator
         * will still enforce required keys).
         */
        Map<String, Object> attributes
) {}
