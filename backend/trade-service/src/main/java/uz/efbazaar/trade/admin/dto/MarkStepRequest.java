package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Size;

/** Optional free-text note the admin attaches when ticking a step. */
public record MarkStepRequest(
        @Size(max = 500) String note
) {}
