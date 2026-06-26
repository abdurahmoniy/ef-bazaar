package uz.efbazaar.marketplace.dto;

import java.time.Instant;
import java.util.UUID;

public record CartItemResponse(
        UUID id,
        UUID listingId,
        ListingResponse listing,
        Instant createdAt
) {}
