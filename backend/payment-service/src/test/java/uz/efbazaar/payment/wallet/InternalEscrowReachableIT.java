package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * That trade-service can reach the escrow API at all.
 *
 * <p>Over a real port, not MockMvc. The bug this exists for was invisible to
 * every MockMvc test in the suite: they call the dispatcher directly and never
 * run the servlet filter chain, so the security rule that stopped applying in
 * production kept passing here. Escrow answered 401 to every call, and no
 * trade — sale or swap — could be accepted.
 *
 * <p>Asserts what the caller can tell apart: 403 means the shared secret was
 * refused, 401 means the request never reached the endpoint. Anything else,
 * including a business error, means the plumbing works.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "app.internal.secret=test-internal-secret")
class InternalEscrowReachableIT extends AbstractPostgresIT {

    private static final String SECRET = "test-internal-secret";

    @Autowired TestRestTemplate rest;
    @LocalServerPort int port;

    private String escrowUrl() {
        return "http://localhost:" + port + "/internal/trades/" + UUID.randomUUID() + "/escrow/hold";
    }

    private ResponseEntity<String> post(String url, String secret) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (secret != null) headers.set("X-Internal-Secret", secret);
        String body = """
                {"buyerId":"11111111-1111-1111-1111-111111111111","priceTiyin":1000000}
                """;
        return rest.exchange(url, HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
    }

    @Test
    void theRightSecretReachesTheEndpoint() {
        ResponseEntity<String> response = post(escrowUrl(), SECRET);

        assertThat(response.getStatusCode())
                .as("401 means security turned it away before the controller ran — "
                        + "the failure that stopped every trade in production")
                .isNotEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getStatusCode())
                .as("403 means the secret was refused")
                .isNotEqualTo(HttpStatus.FORBIDDEN);
        // A wallet with no money refuses the hold, which is the endpoint
        // answering — exactly what we need to see.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void aWrongSecretIsRefusedByTheFilter() {
        assertThat(post(escrowUrl(), "not-the-secret").getStatusCode())
                .as("the filter's own answer, not the security chain's")
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void noSecretIsRefusedByTheFilter() {
        assertThat(post(escrowUrl(), null).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    /**
     * That the reason survives the trip.
     *
     * <p>trade-service reads {@code detail} out of the body and shows it to the
     * user. Spring drops a ResponseStatusException's reason unless problem
     * details are on, so every refusal arrived as "the wallet refused the
     * operation" — true, useless, and identical whether the buyer was short by
     * a hundred so'm or the seller could not cover the fee.
     */
    @Test
    void aRefusalSaysWhichWalletAndHowMuch() {
        ResponseEntity<String> response = post(escrowUrl(), SECRET);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody())
                .as("trade-service parses this field; without it the user is told nothing")
                .contains("\"detail\"")
                .contains("yetarli emas")
                .contains("so'm yetishmayapti");
    }
}
