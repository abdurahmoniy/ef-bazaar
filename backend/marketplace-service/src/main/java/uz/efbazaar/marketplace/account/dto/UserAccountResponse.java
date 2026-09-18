package uz.efbazaar.marketplace.account.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.account.ArchivedReason;
import uz.efbazaar.marketplace.account.EmailSource;
import uz.efbazaar.marketplace.account.UserAccount;
import uz.efbazaar.marketplace.account.UserAccountStatus;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Faqat EGASIGA qaytariladi — ichida {@code email} bor.
 *
 * <p>{@code onMarket} hisoblanadigan maydon, shuning uchun MapStruct emas,
 * {@code static of} fabrikasi (repo konvensiyasi).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserAccountResponse(
        UUID id,
        String title,
        String description,
        Map<String, Object> attributes,
        List<String> mediaMessageIds,
        String email,
        EmailSource emailSource,
        UserAccountStatus status,
        ArchivedReason archivedReason,
        boolean onMarket,
        UUID currentListingId,
        Instant createdAt,
        Instant updatedAt) {

    public static UserAccountResponse of(UserAccount account) {
        return new UserAccountResponse(
                account.getId(),
                account.getTitle(),
                account.getDescription(),
                account.getAttributes(),
                account.getMediaMessageIds(),
                account.getEmail(),
                account.getEmailSource(),
                account.getStatus(),
                account.getArchivedReason(),
                account.isOnMarket(),
                account.getCurrentListingId(),
                account.getCreatedAt(),
                account.getUpdatedAt());
    }
}
