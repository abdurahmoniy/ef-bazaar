package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.time.Instant;
import java.util.UUID;

/**
 * E'lon sahifasidagi sotuvchi — kirmagan mehmonga ham ochiq.
 *
 * <p>Telegram username ATAYLAB YO'Q. U bu yerda tursa xaridor chatni chetlab
 * sotuvchiga to'g'ridan-to'g'ri yozadi va savdo garovsiz ketadi; chatdagi
 * {@code ContactShield} ham ma'nosiz bo'lib qoladi. Ishonch belgisi —
 * {@code verified} va reyting, aloqa — efBazaar chati.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SellerSummary(
        UUID id,
        String displayName,
        String telegramPhotoUrl,
        boolean verified,
        Instant createdAt
) {
    public static SellerSummary from(AuthSummaryClient.UserSummary summary) {
        if (summary == null) return null;
        return new SellerSummary(
                summary.id(),
                summary.displayName(),
                summary.telegramPhotoUrl(),
                summary.verified(),
                summary.createdAt()
        );
    }
}
