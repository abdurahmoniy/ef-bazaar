package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * End-to-end happy path: proposal → openTrade → WAITING_PAYMENT (async) →
 * payment confirmed → email changed → KONAMI_EMAIL_RECEIVED (async) →
 * seller sends password → buyer confirms → SUCCESS.
 *
 * Exercises Kafka async transitions (MockWorker) racing synchronous REST calls
 * and tests that the consumer fixes properly handle at-least-once redelivery.
 */
@SpringBootTest
@AutoConfigureMockMvc
class TradeE2EIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeService trades;
    @Autowired TradeRepository tradeRepo;

    @Test
    void fullHappyPathTerminatesInSuccess() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();

        // Step 1: Open trade; MockWorker + EmailProvisionedConsumer race to
        // drive INITIATED → WAITING_PAYMENT as soon as openTrade commits.
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        // Wait for async WAITING_PAYMENT transition.
        await().atMost(10, TimeUnit.SECONDS).until(() ->
                tradeRepo.findById(t.id()).orElseThrow().getState() == TradeState.WAITING_PAYMENT);

        // Step 2: Buyer confirms payment.
        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/payment-confirmed").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(tradeRepo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        // Step 3: Seller changes email.
        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/email-changed").with(asUser(seller)))
                .andExpect(status().isOk());

        // onEnter(VERIFYING_KONAMI_LINK) publishes forgotPasswordRequest; wait
        // for MockWorker's async KONAMI_EMAIL_RECEIVED, which drives
        // VERIFYING_KONAMI_LINK → WAITING_PASSWORD.
        await().atMost(10, TimeUnit.SECONDS).until(() ->
                tradeRepo.findById(t.id()).orElseThrow().getState() == TradeState.WAITING_PASSWORD);

        // Step 4: Seller sends the one-time password over chat. This is a
        // user-driven action (OneTimePasswordService.sendPassword) — nothing
        // in the async worker pipeline sends it automatically. Synchronously
        // drives WAITING_PASSWORD → WAITING_BUYER_VERIFY.
        mvc.perform(post("/api/v1/trades/" + t.id() + "/messages/password")
                        .with(asUser(seller))
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"k0nami-s3cret\"}"))
                .andExpect(status().isOk());
        assertThat(tradeRepo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_BUYER_VERIFY);

        // Step 5: Buyer confirms; escrow mailbox is handed to buyer.
        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/confirm").with(asUser(buyer)))
                .andExpect(status().isOk());

        assertThat(tradeRepo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.SUCCESS);
    }
}
