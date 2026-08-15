package uz.efbazaar.marketplace.dto;

import uz.efbazaar.marketplace.domain.Listing;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * One row of the in-chat account picker.
 *
 * <p>Deliberately not {@link ListingResponse}: the picker needs enough to tell
 * two accounts apart and nothing more, and a chat should not start shipping the
 * full listing payload — attributes, media list, counters — every time someone
 * opens the menu.
 */
public record ChatListingOptionResponse(
        UUID id,
        String description,
        BigDecimal price,
        boolean priceNegotiable,
        String coverMessageId
) {
    public static ChatListingOptionResponse of(Listing listing) {
        List<String> media = listing.getMediaMessageIds();
        return new ChatListingOptionResponse(
                listing.getId(),
                listing.getDescription(),
                listing.getPrice(),
                listing.isPriceNegotiable(),
                media == null || media.isEmpty() ? null : media.get(0));
    }
}
