package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SellerSummary(
        UUID id,
        String displayName,
        String telegramUsername,
        String telegramPhotoUrl,
        boolean verified,
        Instant createdAt
) {
    public static SellerSummary from(AuthSummaryClient.UserSummary summary) {
        if (summary == null) return null;
        return new SellerSummary(
                summary.id(),
                summary.displayName(),
                summary.telegramUsername(),
                summary.telegramPhotoUrl(),
                summary.verified(),
                summary.createdAt()
        );
    }
}
