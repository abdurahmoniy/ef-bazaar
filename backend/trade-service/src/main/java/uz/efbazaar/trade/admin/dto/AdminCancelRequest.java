package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Size;

/** Optional free-text reason the admin gives when aborting a trade. */
public record AdminCancelRequest(
        @Size(max = 500) String reason
) {}
