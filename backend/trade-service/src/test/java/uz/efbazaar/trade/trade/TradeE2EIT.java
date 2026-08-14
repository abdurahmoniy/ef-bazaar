package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.card.domain.Card;
import uz.efbazaar.trade.card.domain.CardBrand;
import uz.efbazaar.trade.card.repository.CardRepository;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.PasswordRevealResponse;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.dto.SendPasswordRequest;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;

/**
 * End-to-end happy path over the real REST surface: proposal creation →
 * buyer accept → openTrade → WAITING_PAYMENT (async) → payment confirmed →
 * email changed → KONAMI_EMAIL_RECEIVED (async) → seller sends password →
 * buyer reveals password → buyer confirms → SUCCESS → mailbox handoff →
 * second reveal is rejected (410 Gone).
 *
 * Exercises Kafka async transitions (MockWorker) racing synchronous REST calls
 * and tests that the consumer fixes properly handle at-least-once redelivery.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(StubEscrowConfig.class)
@AutoConfigureMockMvc
class TradeE2EIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeRepository tradeRepo;
    @Autowired CardRepository cardRepo;
    @Autowired MailboxRepository mailboxRepo;

    @Test
    void fullHappyPathTerminatesInSuccess() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();

        // Step 1: Seed a card for each party.
        UUID sellerCardId = UUID.randomUUID();
        UUID buyerCardId  = UUID.randomUUID();
        cardRepo.save(Card.builder()
                .id(sellerCardId)
                .ownerUserId(seller)
                .encryptedPan(new byte[]{1, 2, 3})
                .panIv(new byte[12])
                .panTag(new byte[16])
                .last4("1111")
                .expiryMonth((short) 12)
                .expiryYear((short) 2030)
                .brand(CardBrand.VISA)
                .savedToProfile(false)
                .build());
        cardRepo.save(Card.builder()
                .id(buyerCardId)
                .ownerUserId(buyer)
                .encryptedPan(new byte[]{1, 2, 3})
                .panIv(new byte[12])
                .panTag(new byte[16])
                .last4("1111")
                .expiryMonth((short) 12)
                .expiryYear((short) 2030)
                .brand(CardBrand.VISA)
                .savedToProfile(false)
                .build());

        // Step 2: Seller creates a proposal.
        var createReq = new ProposalCreateRequest(chatId, buyer, seller, buyer, 500_000L, sellerCardId, null,
                TradeMode.SMART, null, null);
        var createResult = mvc.perform(post("/api/v1/trades/proposals")
                        .with(asUser(seller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(createReq)))
                .andExpect(status().isCreated())
                .andReturn();
        var proposal = json.readValue(createResult.getResponse().getContentAsString(), ProposalResponse.class);

        // Step 3: Buyer accepts the proposal, opening the trade.
        var acceptResult = mvc.perform(post("/api/v1/trades/proposals/" + proposal.proposalId() + "/accept")
                        .with(asUser(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("cardId", buyerCardId))))
                .andExpect(status().isCreated())
                .andReturn();
        var trade = json.readValue(acceptResult.getResponse().getContentAsString(), TradeResponse.class);

        // Step 4: MockWorker + EmailProvisionedConsumer race to drive
        // INITIATED → WAITING_PAYMENT asynchronously.
        await().atMost(10, TimeUnit.SECONDS).until(() ->
                tradeRepo.findById(trade.id()).orElseThrow().getState() == TradeState.WAITING_PAYMENT);

        // Step 5: Buyer confirms payment.
        mvc.perform(post("/api/v1/trades/" + trade.id() + "/actions/payment-confirmed").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(tradeRepo.findById(trade.id()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        // Step 6: Seller changes email.
        mvc.perform(post("/api/v1/trades/" + trade.id() + "/actions/email-changed").with(asUser(seller)))
                .andExpect(status().isOk());

        // Step 7: onEnter(VERIFYING_KONAMI_LINK) publishes forgotPasswordRequest;
        // wait for MockWorker's async KONAMI_EMAIL_RECEIVED, which drives
        // VERIFYING_KONAMI_LINK → WAITING_PASSWORD.
        await().atMost(10, TimeUnit.SECONDS).until(() ->
                tradeRepo.findById(trade.id()).orElseThrow().getState() == TradeState.WAITING_PASSWORD);

        // Step 8: Seller sends the one-time password over chat. Synchronously
        // drives WAITING_PASSWORD → WAITING_BUYER_VERIFY.
        var sendPasswordReq = new SendPasswordRequest("KonamiPassW0rd!");
        var sendResult = mvc.perform(post("/api/v1/trades/" + trade.id() + "/messages/password")
                        .with(asUser(seller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(sendPasswordReq)))
                .andExpect(status().isOk())
                .andReturn();
        @SuppressWarnings("unchecked")
        Map<String, String> sendBody = json.readValue(sendResult.getResponse().getContentAsString(), Map.class);
        UUID msgId = UUID.fromString(sendBody.get("messageId"));
        assertThat(tradeRepo.findById(trade.id()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_BUYER_VERIFY);

        // Step 9: Buyer reveals the password.
        var revealResult = mvc.perform(post("/api/v1/trades/" + trade.id() + "/messages/" + msgId + "/reveal")
                        .with(asUser(buyer)))
                .andExpect(status().isOk())
                .andReturn();
        var reveal = json.readValue(revealResult.getResponse().getContentAsString(), PasswordRevealResponse.class);
        assertThat(reveal.password()).isEqualTo("KonamiPassW0rd!");

        // Step 10: Buyer confirms; escrow mailbox is handed to buyer.
        mvc.perform(post("/api/v1/trades/" + trade.id() + "/actions/confirm").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(tradeRepo.findById(trade.id()).orElseThrow().getState())
                .isEqualTo(TradeState.SUCCESS);

        var t = tradeRepo.findById(trade.id()).orElseThrow();
        var mailbox = mailboxRepo.findById(t.getMailboxId()).orElseThrow();
        assertThat(mailbox.getOwnerUserId()).isEqualTo(buyer);
        assertThat(mailbox.getTradeId()).isNull();
        assertThat(mailbox.getHandedOffAt()).isNotNull();

        // Step 11: Second reveal must be rejected (IllegalStateException → 410 Gone).
        mvc.perform(post("/api/v1/trades/" + trade.id() + "/messages/" + msgId + "/reveal")
                        .with(asUser(buyer)))
                .andExpect(status().isGone());
    }
}
