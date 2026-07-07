package uz.efbazaar.marketplace.dto;

/** Aggregate counters for the admin dashboard. */
public record AdminStatsResponse(
        long totalListings,
        long activeListings,
        long soldListings,
        long deletedListings,
        long totalReports,
        long pendingReports
) {}
