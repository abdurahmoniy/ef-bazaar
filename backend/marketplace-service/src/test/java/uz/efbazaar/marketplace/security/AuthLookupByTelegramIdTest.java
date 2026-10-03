package uz.efbazaar.marketplace.security;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * "Not linked" and "auth is down" must stay different answers: the inline
 * picker tells an unlinked user to link Telegram, and saying that to a linked
 * user during an auth restart sends them chasing a problem they don't have.
 */
class AuthLookupByTelegramIdTest {

    private static final String URL = "http://auth/internal/auth/v1/users/by-telegram-id/42";

    private AuthSummaryClient client(MockRestServiceServer[] server) {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://auth");
        server[0] = MockRestServiceServer.bindTo(builder).build();
        return new AuthSummaryClient(builder.build(), "test");
    }

    @Test
    void aKnownTelegramIdIsFound() {
        var server = new MockRestServiceServer[1];
        var auth = client(server);
        server[0].expect(requestTo(URL)).andRespond(withSuccess(
                "{\"id\":\"7f0d2b8e-0000-4000-8000-000000000001\",\"displayName\":\"A\",\"telegramId\":42}",
                MediaType.APPLICATION_JSON));

        assertThat(auth.lookupByTelegramId(42L)).isPresent();
    }

    @Test
    void notFoundMeansNotLinked() {
        var server = new MockRestServiceServer[1];
        var auth = client(server);
        server[0].expect(requestTo(URL)).andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThat(auth.lookupByTelegramId(42L)).isEmpty();
    }

    @Test
    void anAuthFailureIsUnavailableNotUnlinked() {
        var server = new MockRestServiceServer[1];
        var auth = client(server);
        server[0].expect(requestTo(URL)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));

        assertThatThrownBy(() -> auth.lookupByTelegramId(42L))
                .isInstanceOfSatisfying(MarketplaceException.class,
                        ex -> assertThat(ex.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test
    void aRejectedSecretIsUnavailableNotUnlinked() {
        var server = new MockRestServiceServer[1];
        var auth = client(server);
        server[0].expect(requestTo(URL)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> auth.lookupByTelegramId(42L)).isInstanceOf(MarketplaceException.class);
    }
}
