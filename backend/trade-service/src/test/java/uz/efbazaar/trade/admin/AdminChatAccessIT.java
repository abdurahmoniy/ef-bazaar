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

    /** Invited but undecided — the state an admin sits in at spec §6.1 step 4. */
    private void givenInvitedTrade() {
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
    }

    private void givenAcceptedTrade() {
        givenInvitedTrade();
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

        // Seed the buyer's own chat first so the doesNotExist assertions
        // below discriminate within a non-empty array, not against an
        // empty one.
        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getBuyerId()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("xaridor xabari")))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("faqat sotuvchiga")))
                .andExpect(status().isOk());

        // Default read — the buyer's own chat.
        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getBuyerId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.text=='xaridor xabari')]").exists())
                .andExpect(jsonPath("$[?(@.text=='faqat sotuvchiga')]").doesNotExist());

        // A party's read is not steerable by target either — the buyer
        // naming SELLER still gets their own chat back, never the seller's.
        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(trade.getBuyerId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.text=='faqat sotuvchiga')]").doesNotExist());
    }

    @Test
    void adminCanReadEitherChat() throws Exception {
        givenAcceptedTrade();

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("sotuvchiga xabar")))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=BUYER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("xaridorga xabar")))
                .andExpect(status().isOk());

        // Each read returns its own chat's message and not the other one's —
        // status 200 alone can't tell "read the named chat" from "read the
        // same chat twice."
        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.text=='sotuvchiga xabar')]").exists())
                .andExpect(jsonPath("$[?(@.text=='xaridorga xabar')]").doesNotExist());
        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=BUYER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.text=='xaridorga xabar')]").exists())
                .andExpect(jsonPath("$[?(@.text=='sotuvchiga xabar')]").doesNotExist());
    }

    @Test
    void adminMustNameATargetChat() throws Exception {
        givenAcceptedTrade();

        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("qaysi chatga?")))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void partyTargetParameterIsIgnored() throws Exception {
        givenAcceptedTrade();

        // Seed the buyer chat so the doesNotExist assertion below
        // discriminates within a non-empty array.
        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages")
                        .with(asUser(trade.getBuyerId()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("xaridor salom")))
                .andExpect(status().isOk());

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
                .andExpect(jsonPath("$[?(@.text=='xaridor salom')]").exists())
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

    /**
     * Spec §6.1 grants the admin the two party chats at <b>accept</b> (step 5),
     * not at invite (step 4). {@code findByIdAndViewer} matches on
     * {@code assignedAdminId} regardless of state — deliberately, because the
     * invitation and accept/decline endpoints need it — so without a gate of
     * its own a candidate could be invited, read both parties' chats, and then
     * decline. The invitation itself must keep working: that is the whole
     * reason the row matches in the first place.
     */
    @Test
    void invitedAdminIsRefusedTheChatsButStillSeesTheInvitation() throws Exception {
        givenInvitedTrade();

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=BUYER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(text("hali qabul qilmadim")))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/trade-admins/me/invitations")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + trade.getId() + "')]").exists());
    }

    /** ...and the same admin gets in as soon as they take the job. */
    @Test
    void acceptingOpensTheChats() throws Exception {
        givenInvitedTrade();
        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isForbidden());

        assignments.accept(adminId, trade.getId());

        mvc.perform(get("/api/v1/trades/" + trade.getId() + "/messages?target=SELLER")
                        .with(asUser(adminId, "ROLE_USER", TA)))
                .andExpect(status().isOk());
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
