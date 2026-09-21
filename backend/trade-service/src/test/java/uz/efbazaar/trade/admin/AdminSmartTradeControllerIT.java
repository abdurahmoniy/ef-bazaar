package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeChat;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeSideService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * "Faol savdolar" — the admin supplying a worker step by hand.
 *
 * <p>The rule under test is that a manual step is held to the same state
 * machine the worker is: it lands only in the state that waits for it, only
 * against a party that has a mailbox, and it moves the trade exactly as the
 * worker's own event would.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminSmartTradeControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeRepository trades;
    @Autowired TradeChatRepository chats;
    @Autowired TradeSideService sides;
    @Autowired MailboxService mailboxes;

    private Trade smartTrade(TradeState state) {
        UUID mailboxId = mailboxes.createPlaceholder("pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade t = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(state)
                .mailboxId(mailboxId)
                .mode(TradeMode.SMART)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        // A sale: only the seller moves an account into a mailbox.
        sides.open(t.getId(), mailboxId, null);
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.BUYER).build());
        return t;
    }

    private static String json(String body) {
        return body;
    }

    @Test
    void aPlainUserIsForbidden() throws Exception {
        mvc.perform(get("/api/v1/admin/smart-trades").with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void theQueueListsALiveSmartTradeWithWhatItIsWaitingFor() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_EMAIL_CHANGE);
        String mine = "$[?(@.id=='" + t.getId() + "')]";

        mvc.perform(get("/api/v1/admin/smart-trades").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath(mine).exists())
                .andExpect(jsonPath(mine + ".expectedAction")
                        .value(org.hamcrest.Matchers.hasItem("EMAIL_CHANGE_CODE")));
    }

    @Test
    void aSaleShowsOnlyTheSellersMailbox() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(get("/api/v1/admin/smart-trades/{id}", t.getId()).with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sides[0].role").value("SELLER"))
                .andExpect(jsonPath("$.sides[0].mailboxId").value(t.getMailboxId().toString()))
                .andExpect(jsonPath("$.sides[1].role").value("BUYER"))
                .andExpect(jsonPath("$.sides[1].mailboxId").doesNotExist());
    }

    @Test
    void anAdminEnteredCodeReachesTheSellersSide() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(post("/api/v1/admin/smart-trades/{id}/email-change-code", t.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{\"role\":\"SELLER\",\"code\":\"563280\"}")))
                .andExpect(status().isOk());

        assertThat(sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getEmailChangeCode())
                .isEqualTo("563280");
        assertThat(trades.findById(t.getId()).orElseThrow().getState())
                .as("a code is shown to the party; it does not move the trade by itself")
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);
    }

    /**
     * Favqulodda yo'l: worker kirish kodini yetkaza olmadi va uni admin
     * o'zi o'qib yubordi. Kod akkountni QABUL QILAYOTGAN tarafga yoziladi.
     */
    @Test
    void anAdminEnteredLoginCodeReachesTheReceivingSide() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_BUYER_VERIFY);

        mvc.perform(post("/api/v1/admin/smart-trades/{id}/login-code", t.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{\"role\":\"BUYER\",\"code\":\"447711\"}")))
                .andExpect(status().isOk());

        assertThat(sides.of(t.getId(), ParticipantRole.BUYER).orElseThrow().getLoginCode())
                .isEqualTo("447711");
        assertThat(trades.findById(t.getId()).orElseThrow().getState())
                .as("kod ko'rsatiladi, savdoni o'zi siljitmaydi")
                .isEqualTo(TradeState.WAITING_BUYER_VERIFY);
    }

    @Test
    void aLoginCodeForATradeInAnotherStateIsRefused() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_PASSWORD);

        mvc.perform(post("/api/v1/admin/smart-trades/{id}/login-code", t.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{\"role\":\"BUYER\",\"code\":\"447711\"}")))
                .andExpect(status().isConflict());
    }

    /** The page was stale: the trade moved on. The admin must see that, not push it anywhere. */
    @Test
    void aCodeForATradeInAnotherStateIsRefused() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_PASSWORD);

        mvc.perform(post("/api/v1/admin/smart-trades/{id}/email-change-code", t.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{\"role\":\"SELLER\",\"code\":\"563280\"}")))
                .andExpect(status().isConflict());
    }

    @Test
    void aCodeThatIsNotSixDigitsIsRejected() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(post("/api/v1/admin/smart-trades/{id}/email-change-code", t.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{\"role\":\"SELLER\",\"code\":\"5632\"}")))
                .andExpect(status().isBadRequest());
    }

    /** A sale's buyer has no mailbox, so there is nothing a code could belong to. */
    @Test
    void aCodeAgainstThePartyWithNoMailboxIsRejected() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(post("/api/v1/admin/smart-trades/{id}/email-change-code", t.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{\"role\":\"BUYER\",\"code\":\"563280\"}")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void confirmingKonamiMailMovesTheSaleOnExactlyAsTheWorkerWould() throws Exception {
        Trade t = smartTrade(TradeState.VERIFYING_KONAMI_LINK);

        mvc.perform(post("/api/v1/admin/smart-trades/{id}/konami-email-confirm", t.getId())
                        .with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("{\"role\":\"SELLER\"}")))
                .andExpect(status().isOk());

        assertThat(trades.findById(t.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_PASSWORD);
        assertThat(sides.of(t.getId(), ParticipantRole.SELLER).orElseThrow().getKonamiVerifiedAt())
                .isNotNull();
    }

    @Test
    void aHumanTradeIsNotFoundHere() throws Exception {
        Trade t = smartTrade(TradeState.WAITING_EMAIL_CHANGE);
        t.setMode(TradeMode.HUMAN);
        trades.save(t);

        mvc.perform(get("/api/v1/admin/smart-trades/{id}", t.getId()).with(asAdmin()))
                .andExpect(status().isNotFound());
    }
}
