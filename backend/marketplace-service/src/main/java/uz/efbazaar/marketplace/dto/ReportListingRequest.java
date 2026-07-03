package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReportListingRequest(
        @NotBlank @Size(max = 64) String reason,
        @Size(max = 1000) String details
) {}
