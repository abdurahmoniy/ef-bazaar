package uz.efbazaar.marketplace.dto;

import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.domain.ReportStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * Moderation view of a listing report — enriched with a listing summary and
 * resolved display names so the admin UI renders without extra round-trips.
 * Listing fields are {@code null} when the listing row no longer exists.
 */
public record AdminReportResponse(
        UUID id,
        UUID listingId,
        String listingDescription,
        ListingStatus listingStatus,
        UUID sellerId,
        String sellerName,
        UUID reporterId,
        String reporterName,
        String reason,
        String details,
        ReportStatus status,
        Instant createdAt
) {}
