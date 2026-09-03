package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
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
        Map<String, Object> attributes,

        /**
         * Hamkor kanallari — e'lonni ularda ham chiqarish uchun.
         *
         * <p>{@code null} bo'sh deb qabul qilinadi: kanal tanlash
         * ixtiyoriy va eski klientlar bu maydonni umuman yubormaydi.
         */
        List<UUID> channelIds
) {
    /**
     * Kanalsiz shakl — reklama bozoridan oldingi chaqiruvchilar uchun.
     *
     * <p>Kanal tanlash ixtiyoriy, va e'lon berishning oddiy holati
     * hech qanday kanalni tanlamaslik. Maydonni majburiy qilsak, uni
     * bilmaydigan har bir chaqiruvchi o'zgarishga majbur bo'lardi.
     */
    public ListingCreateRequest(String description, BigDecimal price,
                                boolean priceNegotiable, Map<String, Object> attributes) {
        this(description, price, priceNegotiable, attributes, null);
    }
}
