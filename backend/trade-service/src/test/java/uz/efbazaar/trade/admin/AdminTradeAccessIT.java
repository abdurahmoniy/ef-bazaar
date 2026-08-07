package uz.efbazaar.trade.admin;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.TradeViewer;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class AdminTradeAccessIT extends AbstractIntegrationIT {

    @Autowired TradeRepository trades;
    @Autowired TradeService tradeService;
    @Autowired MockMvc mvc;

    private Trade persistHumanTrade(UUID seller, UUID buyer, UUID admin) {
        return trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(seller)
                .buyerId(buyer)
                .priceUzs(80_000)
                .state(TradeState.IN_PROGRESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .adminFeeUzs(15_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void assignedAdminCanReadTheTrade() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        Trade loaded = tradeService.getForViewer(t.getId(), admin);

        assertThat(loaded.getId()).isEqualTo(t.getId());
        assertThat(loaded.viewerFor(admin)).isEqualTo(TradeViewer.ADMIN);
    }

    @Test
    void unassignedAdminGetsNotFoundNotForbidden() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);
        UUID otherAdmin = UUID.randomUUID();

        assertThatThrownBy(() -> tradeService.getForViewer(t.getId(), otherAdmin))
                .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void partyOnlyPathStillExcludesTheAdmin() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        // get() keeps its party-only meaning — close-confirm depends on it.
        assertThatThrownBy(() -> tradeService.get(t.getId(), admin))
                .isInstanceOf(EntityNotFoundException.class);
        assertThat(tradeService.get(t.getId(), seller).getId()).isEqualTo(t.getId());
    }

    /**
     * The admin's workspace is built around one trade at a time, but
     * {@code GET /api/v1/trades/{id}} used the party-only {@code trades.get},
     * so the assigned admin got a 404 on the single trade they are working and
     * could only ever see it inside the {@code /trade-admins/me/trades} list.
     */
    @Test
    void assignedAdminCanFetchTheTradeOverHttp() throws Exception {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        mvc.perform(get("/api/v1/trades/" + t.getId())
                        .with(asUser(admin, "ROLE_USER", "ROLE_TRADE_ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(t.getId().toString()))
                .andExpect(jsonPath("$.role")
                        // role is a party-only concept — the admin is neither side.
                        .doesNotExist());

        // A party still gets their own side back...
        mvc.perform(get("/api/v1/trades/" + t.getId()).with(asUser(seller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("SELLER"));
        mvc.perform(get("/api/v1/trades/" + t.getId()).with(asUser(buyer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("BUYER"));

        // ...and a stranger, trade-admin role or not, still gets nothing.
        mvc.perform(get("/api/v1/trades/" + t.getId())
                        .with(asUser(UUID.randomUUID(), "ROLE_USER", "ROLE_TRADE_ADMIN")))
                .andExpect(status().isNotFound());
    }

    @Test
    void humanTradeCanBePersistedWithoutCards() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        assertThat(t.getSellerCardId()).isNull();
        assertThat(t.getBuyerCardId()).isNull();
    }
}
