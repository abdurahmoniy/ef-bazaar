package uz.efbazaar.payment.wallet;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.controller.InternalTradeEscrowController.HoldRequest;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The escrow endpoints move money and carry no user identity, so the shared
 * secret is the only thing standing in front of them.
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "app.internal.secret=test-secret")
class InternalTradeEscrowControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired LedgerService ledger;

    @Value("${app.internal.secret}") String secret;

    private UUID fundedUser(long tiyin) {
        UUID user = UUID.randomUUID();
        ledger.post(TransactionKind.DEPOSIT, "seed-" + UUID.randomUUID(), null, null,
                List.of(new Posting(LedgerAccount.PLATFORM_CARDS, null, tiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, user, -tiyin)));
        return user;
    }

    @Test
    void aCallWithoutTheSecretMovesNothing() throws Exception {
        UUID buyer = fundedUser(50_000_000L);

        mvc.perform(post("/internal/trades/{id}/escrow/hold", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new HoldRequest(buyer, 50_000_000L))))
                .andExpect(status().isForbidden());

        assertThat(ledger.balanceOf(buyer).getHeldTiyin())
                .as("an unauthenticated caller must not be able to freeze a wallet")
                .isZero();
    }

    @Test
    void aWrongSecretIsRefused() throws Exception {
        mvc.perform(post("/internal/trades/{id}/escrow/hold", UUID.randomUUID())
                        .header("X-Internal-Secret", "not-the-secret")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                new HoldRequest(UUID.randomUUID(), 50_000_000L))))
                .andExpect(status().isForbidden());
    }

    @Test
    void theRightSecretHoldsAndReportsWhatTheSellerWouldGet() throws Exception {
        UUID buyer = fundedUser(50_000_000L);

        mvc.perform(post("/internal/trades/{id}/escrow/hold", UUID.randomUUID())
                        .header("X-Internal-Secret", secret)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new HoldRequest(buyer, 50_000_000L))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.feeTiyin").value(3_750_000))
                .andExpect(jsonPath("$.sellerProceedsTiyin").value(46_250_000));

        assertThat(ledger.balanceOf(buyer).getHeldTiyin()).isEqualTo(50_000_000L);
    }

    @Test
    void aBuyerWithoutTheMoneyGetsAConflictNotAServerError() throws Exception {
        UUID buyer = fundedUser(1_000_000L);

        mvc.perform(post("/internal/trades/{id}/escrow/hold", UUID.randomUUID())
                        .header("X-Internal-Secret", secret)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new HoldRequest(buyer, 50_000_000L))))
                .andExpect(status().isConflict());
    }
}
