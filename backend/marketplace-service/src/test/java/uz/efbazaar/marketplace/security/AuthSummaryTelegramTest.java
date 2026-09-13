package uz.efbazaar.marketplace.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClient;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthSummaryTelegramTest {
    private final UUID userId = UUID.randomUUID();
    private final AuthSummaryClient users = spy(new AuthSummaryClient(RestClient.create(), "test"));

    @Test void linkedAccountWithoutUsernameCanProceed() {
        doReturn(Optional.of(summary(123L))).when(users).resolve(userId);
        assertThatCode(() -> users.requireTelegramLinked(userId)).doesNotThrowAnyException();
    }
    @Test void unlinkedAccountIsForbidden() {
        doReturn(Optional.of(summary(null))).when(users).resolve(userId);
        assertThatThrownBy(() -> users.requireTelegramLinked(userId))
                .isInstanceOfSatisfying(MarketplaceException.class, ex -> {
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(ex.getCode()).isEqualTo("telegram_required");
                });
    }
    @Test void unavailableIdentityCheckFailsClosedWithoutClaimingTelegramIsUnlinked() {
        doReturn(Optional.empty()).when(users).resolve(userId);
        assertThatThrownBy(() -> users.requireTelegramLinked(userId))
                .isInstanceOfSatisfying(MarketplaceException.class, ex -> {
                    assertThat(ex.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(ex.getCode()).isEqualTo("telegram_check_unavailable");
                });
    }
    private AuthSummaryClient.UserSummary summary(Long telegramId) {
        return new AuthSummaryClient.UserSummary(userId, "User", null, telegramId, false, null, false);
    }
}
