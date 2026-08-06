package uz.efbazaar.trade.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminChatAccessIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeRepository trades;
    @Autowired TradeChatRepository chats;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired MailboxService mailboxes;

    private static final String TA = "ROLE_TRADE_ADMIN";

    private UUID adminId;
    private Trade trade;

    private void givenAcceptedTrade() {
        adminId = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(adminId).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        trade = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.WAITING_ADMIN)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.BUYER).build());
        assignments.accept(adminId, trade.getId());
    }

    private String text(String s) throws Exception {
        return json.writeValueAsString(Map.of("text", s));
    }

    @Test
    void adminWritesIntoTheSellerChatAndTheSellerSeesIt() throws Exception {
        givenAcceptedTrade();

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("Akkountni shu emailga otkazing")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senderType").value("HUMAN_ADMIN"));

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getSellerId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.text=='Akkountni shu emailga otkazing')]").exists());
    }

    @Test
    void theOtherPartyDoesNotSeeIt() throws Exception {
        givenAcceptedTrade();
        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("faqat sotuvchiga")))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getBuyerId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.text=='faqat sotuvchiga')]").doesNotExist());
    }

    @Test
    void adminCanReadEitherChat() throws Exception {
        givenAcceptedTrade();

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=BUYER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isOk());
    }

    @Test
    void adminMustNameATargetChat() throws Exception {
        givenAcceptedTrade();

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("qaysi chatga?")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void partyTargetParameterIsIgnored() throws Exception {
        givenAcceptedTrade();

        // The seller aiming at BUYER still lands in their own chat.
        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=BUYER")
                        .with(asUser(trade.getSellerId()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("men sotuvchiman")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.senderType").value("USER"));

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getBuyerId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.text=='men sotuvchiman')]").doesNotExist());
    }

    @Test
    void unassignedAdminCannotWrite() throws Exception {
        givenAcceptedTrade();
        UUID intruder = UUID.randomUUID();

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(intruder, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("men ham adminman")))
                .andExpect(status().isNotFound());
    }

    @Test
    void adminMessageReArmsTheIdleWatchdog() throws Exception {
        givenAcceptedTrade();
        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setEscalationDeadlineAt(Instant.now().minusSeconds(60));
        trades.save(t);

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("uzoq suhbat")))
                .andExpect(status().isOk());

        org.assertj.core.api.Assertions
                .assertThat(trades.findById(trade.getId()).orElseThrow().getEscalationDeadlineAt())
                .isAfter(Instant.now());
    }
}
