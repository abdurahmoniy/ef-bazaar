package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * Batch lookup request for {@code /internal/auth/v1/users/summary/batch}.
 * Exactly one of the two lists is expected to be non-empty; both may be sent
 * together and the results are unioned. {@code telegramIds} exists for
 * external integrations (Chempionat-X identity backfill) that only know the
 * Telegram identity.
 */
public record UserSummaryBatchRequest(
        @Size(max = 100)
        List<UUID> ids,
        @Size(max = 100)
        List<Long> telegramIds
) {
    public boolean isEmpty() {
        return (ids == null || ids.isEmpty())
                && (telegramIds == null || telegramIds.isEmpty());
    }
}
