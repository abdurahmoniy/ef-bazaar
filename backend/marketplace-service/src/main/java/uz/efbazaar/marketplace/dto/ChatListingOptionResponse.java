package uz.efbazaar.marketplace.dto;

import uz.efbazaar.marketplace.domain.Listing;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * One row of the in-chat account picker.
 */
public record ChatListingOptionResponse(
        UUID id,
        String description,
        BigDecimal price,
        boolean priceNegotiable,
        String coverMessageId,
        String exchangeMode,
        Map<String, Object> attributes
) {
    public static ChatListingOptionResponse of(Listing listing) {
        List<String> media = listing.getMediaMessageIds();
        Map<String, Object> attrs = listing.getAttributes() != null ? listing.getAttributes() : Map.of();
        Object exMode = attrs.get("exchange_mode");
        String exchangeMode = exMode != null ? exMode.toString() : null;
        return new ChatListingOptionResponse(
                listing.getId(),
                listing.getDescription(),
                listing.getPrice(),
                listing.isPriceNegotiable(),
                media == null || media.isEmpty() ? null : media.get(0),
                exchangeMode,
                attrs);
    }
}
