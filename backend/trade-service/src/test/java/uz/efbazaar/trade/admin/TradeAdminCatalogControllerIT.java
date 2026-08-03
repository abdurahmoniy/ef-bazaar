package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeAdminCatalogControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired TradeRepository trades;

    /**
     * The catalogue sort tests assert on absolute position ($[0]) and on ties
     * (two admins can share the same average rating), so leftover rows from
     * an earlier test method in this class would make the outcome depend on
     * JUnit's method order rather than the code under test. Start every test
     * from an empty table.
     */
    @BeforeEach
    void cleanCatalogue() {
        trades.deleteAll();
        profiles.deleteAll();
    }

    private UUID admin(boolean active, boolean accepting, int concurrent,
                       int ratingSum, int ratingCount) {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id)
                .minFeeUzs(15_000)
                .maxFeeUzs(40_000)
                .active(active)
                .acceptingOrders(accepting)
                .maxConcurrentTrades(concurrent)
                .ratingSum(ratingSum)
                .ratingCount(ratingCount)
                .completedCount(ratingCount)
                .totalWorkSeconds(ratingCount * 3600L)
                .build());
        return id;
    }

    private void giveActiveTrade(UUID adminId) {
        trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.IN_PROGRESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void listsOnlyActiveAcceptingAdmins() throws Exception {
        UUID visible  = admin(true,  true,  3, 20, 4);
        UUID revoked  = admin(false, true,  3, 25, 5);
        UUID paused   = admin(true,  false, 3, 25, 5);

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + visible + "')]").exists())
                .andExpect(jsonPath("$[?(@.userId=='" + revoked + "')]").doesNotExist())
                .andExpect(jsonPath("$[?(@.userId=='" + paused + "')]").doesNotExist());
    }

    @Test
    void exposesAverageStarsAndWorkSeconds() throws Exception {
        UUID a = admin(true, true, 3, 20, 4);   // 5.0 stars, 3600s per trade

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + a + "')].averageStars").value(5.0))
                .andExpect(jsonPath("$[?(@.userId=='" + a + "')].averageWorkSeconds").value(3600));
    }

    @Test
    void unratedAdminHasNullAverages() throws Exception {
        UUID fresh = admin(true, true, 3, 0, 0);

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + fresh + "')].averageStars")
                        .isEmpty())
                .andExpect(jsonPath("$[?(@.userId=='" + fresh + "')].averageWorkSeconds")
                        .isEmpty());
    }

    @Test
    void fullAdminIsReturnedButFlaggedBusy() throws Exception {
        UUID full = admin(true, true, 1, 20, 4);
        giveActiveTrade(full);

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + full + "')].busy").value(true))
                .andExpect(jsonPath("$[?(@.userId=='" + full + "')].activeTrades").value(1));
    }

    @Test
    void higherRatedAdminSortsFirstByDefault() throws Exception {
        UUID low  = admin(true, true, 3, 6, 3);    // 2.0
        UUID high = admin(true, true, 3, 15, 3);   // 5.0

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].userId").value(high.toString()))
                .andExpect(jsonPath("$[?(@.userId=='" + low + "')]").exists());
    }

    @Test
    void feeAscSortPutsTheCheapestFirst() throws Exception {
        UUID cheap = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(cheap).minFeeUzs(5_000).maxFeeUzs(9_000).build());
        admin(true, true, 3, 15, 3);

        mvc.perform(get("/api/v1/trade-admins?sort=FEE_ASC")
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].userId").value(cheap.toString()));
    }

    @Test
    void unknownSortValueIsRejected() throws Exception {
        mvc.perform(get("/api/v1/trade-admins?sort=CHEAPEST")
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isBadRequest());
    }
}
