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

    /** See TradeEscrowServiceIT: the rates live in the database now, and the
     *  suite shares one container, so a class asserting exact so'm has to pin
     *  them or inherit whatever the last test left behind. */
    @Autowired uz.efbazaar.payment.wallet.service.TradeCommissionService commissionService;

    @org.junit.jupiter.api.BeforeEach
    void pinCommissionRates() {
        commissionService.updateConfig(java.util.UUID.randomUUID(),
                new uz.efbazaar.payment.wallet.dto.UpdateTradeCommissionConfigRequest(
                        100_000L, 10.0, 7.5, 5_000L, 10_000L));
    }

    @Test
    void aCallWithoutTheSecretMovesNothing() throws Exception {
        UUID buyer = fundedUser(50_000_000L);

        mvc.perform(post("/internal/trades/{id}/escrow/hold", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new HoldRequest(buyer, null, 50_000_000L, null))))
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
                                new HoldRequest(UUID.randomUUID(), null, 50_000_000L, null))))
                .andExpect(status().isForbidden());
    }

    @Test
    void theRightSecretHoldsAndReportsWhatTheSellerWouldGet() throws Exception {
        UUID buyer = fundedUser(50_000_000L);

        mvc.perform(post("/internal/trades/{id}/escrow/hold", UUID.randomUUID())
                        .header("X-Internal-Secret", secret)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(new HoldRequest(buyer, null, 50_000_000L, null))))
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
                        .content(json.writeValueAsString(new HoldRequest(buyer, null, 50_000_000L, null))))
                .andExpect(status().isConflict());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
            "SELLER,0,3750000,0", "BUYER,0,0,3750000", "SPLIT,0,1875000,1875000",
            "SELLER,1000000,2750000,1000000", "BUYER,1000000,0,4750000",
            "SPLIT,1000000,875000,2875000", "SPLIT,10000000,0,11875000"})
    void chosenFeePayerControlsHoldsSettlementAndRefunds(String payer, long price,
                                                       long sellerHold, long buyerHold) throws Exception {
        for (String outcome : List.of("settle", "release")) {
            UUID seller = fundedUser(20_000_000L);
            UUID buyer = fundedUser(20_000_000L);
            UUID trade = UUID.randomUUID();
            String body = json.writeValueAsString(java.util.Map.of("buyerId", buyer, "sellerId", seller,
                    "priceTiyin", price, "feeBaseTiyin", 50_000_000L, "adminFeePayer", payer));
            mvc.perform(post("/internal/trades/{id}/escrow/hold", trade)
                            .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk());
            assertThat(ledger.balanceOf(seller).getHeldTiyin()).isEqualTo(sellerHold);
            assertThat(ledger.balanceOf(buyer).getHeldTiyin()).isEqualTo(buyerHold);
            // A retry must succeed even when the first hold exhausted a wallet.
            mvc.perform(post("/internal/trades/{id}/escrow/hold", trade)
                            .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk());
            for (int retry = 0; retry < 2; retry++) {
                mvc.perform(post("/internal/trades/{id}/escrow/" + outcome, trade)
                                .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                        .andExpect(status().isOk());
            }
            assertThat(ledger.balanceOf(seller).getHeldTiyin()).isZero();
            assertThat(ledger.balanceOf(buyer).getHeldTiyin()).isZero();
            long sellerFee = payer.equals("SELLER") ? 3_750_000L : payer.equals("SPLIT") ? 1_875_000L : 0;
            assertThat(ledger.balanceOf(seller).getAvailableTiyin())
                    .isEqualTo(outcome.equals("release") ? 20_000_000L : 20_000_000L + price - sellerFee);
            assertThat(ledger.balanceOf(buyer).getAvailableTiyin())
                    .isEqualTo(outcome.equals("release") ? 20_000_000L : 20_000_000L - buyerHold);
        }
    }


    @Test
    void feesAreFrozenAfterHoldAndAChangedQuoteCannotBeAccepted() throws Exception {
        UUID seller = fundedUser(1_875_000L), buyer = fundedUser(1_875_000L), trade = UUID.randomUUID();
        String body = json.writeValueAsString(java.util.Map.of("buyerId", buyer, "sellerId", seller,
                "priceTiyin", 0L, "feeBaseTiyin", 50_000_000L, "adminFeePayer", "SPLIT",
                "expectedFeeTiyin", 3_750_000L));
        mvc.perform(post("/internal/trades/{id}/escrow/hold", trade)
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        commissionService.updateConfig(UUID.randomUUID(), new uz.efbazaar.payment.wallet.dto.UpdateTradeCommissionConfigRequest(
                100_000L, 20.0, 15.0, 5_000L, 10_000L));
        // Lost-response retry succeeds with no available funds and a changed commission schedule.
        mvc.perform(post("/internal/trades/{id}/escrow/hold", trade)
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.feeTiyin").value(3_750_000L));
        mvc.perform(post("/internal/trades/{id}/escrow/hold", UUID.randomUUID())
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
        mvc.perform(post("/internal/trades/{id}/escrow/settle", trade)
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.feeTiyin").value(3_750_000L));
        assertThat(ledger.balanceOf(seller).getAvailableTiyin()).isZero();
        assertThat(ledger.balanceOf(buyer).getAvailableTiyin()).isZero();
        assertThat(ledger.balanceOf(seller).getHeldTiyin()).isZero();
        assertThat(ledger.balanceOf(buyer).getHeldTiyin()).isZero();
        mvc.perform(post("/internal/trades/{id}/escrow/release", trade)
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void eitherUnfundedHalfPreventsBothHolds() throws Exception {
        for (boolean sellerUnfunded : List.of(true, false)) {
            UUID seller = fundedUser(sellerUnfunded ? 100L : 1_875_000L);
            UUID buyer = fundedUser(sellerUnfunded ? 1_875_000L : 100L);
            String body = json.writeValueAsString(java.util.Map.of("buyerId", buyer, "sellerId", seller,
                    "priceTiyin", 0L, "feeBaseTiyin", 50_000_000L, "adminFeePayer", "SPLIT"));
            mvc.perform(post("/internal/trades/{id}/escrow/hold", UUID.randomUUID())
                            .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isConflict());
            assertThat(ledger.balanceOf(seller).getHeldTiyin()).isZero();
            assertThat(ledger.balanceOf(buyer).getHeldTiyin()).isZero();
        }
    }

    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"settle", "release"})
    void legacyHoldsKeepOriginalAmountsAndCannotResolveTwice(String outcome) throws Exception {
        UUID seller = fundedUser(10_000_000L), buyer = fundedUser(10_000_000L), trade = UUID.randomUUID();
        String body = json.writeValueAsString(java.util.Map.of("buyerId", buyer, "sellerId", seller,
                "priceTiyin", 1_000_000L, "feeBaseTiyin", 50_000_000L));
        mvc.perform(post("/internal/trades/{id}/escrow/hold", trade)
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        // Only this test's row is removed to model a hold created before the snapshot migration.
        jdbc.update("DELETE FROM trade_escrow_terms WHERE trade_id = ?", trade);
        commissionService.updateConfig(UUID.randomUUID(), new uz.efbazaar.payment.wallet.dto.UpdateTradeCommissionConfigRequest(
                100_000L, 20.0, 15.0, 5_000L, 10_000L));
        mvc.perform(post("/internal/trades/{id}/escrow/" + outcome, trade)
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        assertThat(ledger.balanceOf(seller).getAvailableTiyin()).isEqualTo(outcome.equals("release") ? 10_000_000L : 7_250_000L);
        assertThat(ledger.balanceOf(buyer).getAvailableTiyin()).isEqualTo(outcome.equals("release") ? 10_000_000L : 9_000_000L);
        assertThat(ledger.balanceOf(seller).getHeldTiyin()).isZero();
        assertThat(ledger.balanceOf(buyer).getHeldTiyin()).isZero();
        // Also model an already-resolved pre-migration trade: recover terminal ledger history.
        jdbc.update("DELETE FROM trade_escrow_terms WHERE trade_id = ?", trade);
        mvc.perform(post("/internal/trades/{id}/escrow/" + outcome, trade)
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        String opposite = outcome.equals("settle") ? "release" : "settle";
        mvc.perform(post("/internal/trades/{id}/escrow/" + opposite, trade)
                        .header("X-Internal-Secret", secret).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }
}
