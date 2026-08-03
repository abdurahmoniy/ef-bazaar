package uz.efbazaar.marketplace.service;

import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.MatchDetails;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record MatchedListingPage(
        List<Listing> listings,
        Map<UUID, MatchDetails> details,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
}
