package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.Map;

/**
 * PATCH semantics for typed columns — {@code null} means "keep as-is".
 *
 * <p>{@code attributes} replaces the whole map when non-null (there is no
 * partial-per-key merge). Passing an empty map wipes attributes; passing
 * {@code null} keeps the existing set.
 */
public record ListingUpdateRequest(
        @Size(min = 10, max = 4000)
        String description,

        @DecimalMin(value = "0.00", inclusive = true)
        BigDecimal price,

        Boolean priceNegotiable,

        Map<String, Object> attributes
) {}
