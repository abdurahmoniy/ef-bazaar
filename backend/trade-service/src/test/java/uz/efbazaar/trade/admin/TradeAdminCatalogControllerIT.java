package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.security.AuthSummaryClient;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.transaction.annotation.Transactional
class TradeAdminCatalogControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired TradeRepository trades;

    /**
     * A spy, not a full mock: unstubbed calls fall through to the real
     * {@link AuthSummaryClient}, which in this test environment short-circuits
     * to an empty map because {@code INTERNAL_API_SECRET} is unset (see
     * {@code blankOrAbsentQueryKeepsAdminsWithUnresolvedNames}, which pins that
     * behaviour). That keeps the six pre-existing tests below — none of which
     * stub this bean — working exactly as before; only the two name-filter
     * tests override {@code resolveAll} to supply a resolvable name.
     */
    @SpyBean AuthSummaryClient authSummaries;

    /**
     * The catalogue sort tests assert on absolute position ($[0]) and on ties
     * (two admins can share the same average rating), so leftover rows from
     * an earlier test method in this class would make the outcome depend on
     * JUnit's method order rather than the code under test. Start every test
     * from an isolated catalogue view. Each test rolls back its fixtures and
     * temporary visibility changes; unrelated trades/claims must remain intact.
     */
    @BeforeEach
    void cleanCatalogue() {
        // Hide inherited fixtures only inside this rollback-only test transaction.
        // Global trade deletion destroys other tests' immutable provision claims.
        for (TradeAdminProfile profile : profiles.findAll()) profile.setActive(false);
        profiles.flush();
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

    @Test
    void nameFilterMatchesResolvedNameCaseInsensitivelyAndDropsUnresolved() throws Exception {
        UUID resolvable = admin(true, true, 3, 20, 4);
        UUID unresolvable = admin(true, true, 3, 20, 4);

        // Only "resolvable" gets a name back from auth-service; "unresolvable"
        // is simply absent from the map, exactly like a real auth-service miss.
        Mockito.when(authSummaries.resolveAll(Mockito.anyCollection()))
                .thenReturn(Map.of(resolvable, new AuthSummaryClient.UserSummary(
                        resolvable, "Johnny Cash", null, null, true, Instant.now(), false)));

        // Mixed case and surrounding whitespace: matches() lowercases and
        // trims, so this pins that rather than leaving it to chance.
        mvc.perform(get("/api/v1/trade-admins")
                        .param("q", "  JOHNNY  ")
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + resolvable + "')]").exists())
                .andExpect(jsonPath("$[?(@.userId=='" + unresolvable + "')]").doesNotExist());
    }

    @Test
    void blankOrAbsentQueryKeepsAdminsWithUnresolvedNames() throws Exception {
        UUID unresolvable = admin(true, true, 3, 20, 4);
        // authSummaries is not stubbed here: the real client short-circuits
        // to Map.of() because INTERNAL_API_SECRET is unset in the test
        // environment, so this admin's displayName is unresolved (null). A
        // blank or absent q must not drop it.

        mvc.perform(get("/api/v1/trade-admins").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + unresolvable + "')]").exists());

        mvc.perform(get("/api/v1/trade-admins?q=").with(asUser(UUID.randomUUID())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId=='" + unresolvable + "')]").exists());
    }
}
