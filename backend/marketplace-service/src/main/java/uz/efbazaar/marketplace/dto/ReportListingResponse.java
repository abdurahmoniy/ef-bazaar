package uz.efbazaar.marketplace.dto;

import uz.efbazaar.marketplace.domain.ReportStatus;

import java.time.Instant;
import java.util.UUID;

public record ReportListingResponse(
        UUID id,
        UUID listingId,
        String reason,
        ReportStatus status,
        Instant createdAt,
        boolean alreadyReported
) {}
