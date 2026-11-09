package uz.efbazaar.marketplace.gamer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.gamer.GamerCardDtos.GamerCardResponse;
import uz.efbazaar.marketplace.gamer.GamerCardDtos.Tier;
import uz.efbazaar.marketplace.gamer.GamerRepositories.GamerProfileRepository;
import uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GamerCardServiceTest {

    private static final UUID USER = UUID.randomUUID();

    @Mock private GamerStatsRepository stats;
    @Mock private GamerProfileRepository profiles;
    @Mock private ListingRepository listings;
    @Mock private AuthSummaryClient authSummary;
    @Mock private uz.efbazaar.marketplace.trust.BlacklistGuard blacklistGuard;

    private GamerCardService service;

    @BeforeEach
    void setUp() {
        service = new GamerCardService(stats, profiles, listings, authSummary, blacklistGuard);
        lenient().when(stats.findById(USER)).thenReturn(Optional.empty());
        lenient().when(profiles.findById(USER)).thenReturn(Optional.empty());
        lenient().when(listings.countBySellerIdAndStatus(any(), any())).thenReturn(0L);
        lenient().when(listings.countBySoldToUserId(any())).thenReturn(0L);
        lenient().when(authSummary.resolve(USER)).thenReturn(Optional.of(
                new AuthSummaryClient.UserSummary(USER, "Ali", "ali", 5L, true,
                        Instant.parse("2026-01-01T00:00:00Z"), true)));
    }

    @Test
    void freshUserGetsDefaultsAndSilverTier() {
        GamerCardResponse card = service.getCard(USER, USER);

        assertEquals(1000, card.elo());
        assertEquals(Tier.SILVER, card.tier());
        assertNull(card.winRatePercent());
        assertEquals("Ali", card.displayName());
    }

    @Test
    void ownerSeesTheirOwnTelegramHandle() {
        assertEquals("ali", service.getCard(USER, USER).telegramUsername());
    }

    @Test
    void othersNeverSeeTheTelegramHandle() {
        // Karta e'lon sahifasida ko'rinadi: username bu yerda bo'lsa xaridor
        // chatni chetlab, garovsiz savdoga ketadi.
        assertNull(service.getCard(USER, UUID.randomUUID()).telegramUsername());
        assertNull(service.getCard(USER, null).telegramUsername());
    }

    @Test
    void tiersFollowEloThresholds() {
        assertEquals(Tier.BRONZE, Tier.fromElo(999));
        assertEquals(Tier.SILVER, Tier.fromElo(1000));
        assertEquals(Tier.GOLD, Tier.fromElo(1200));
        assertEquals(Tier.ELITE, Tier.fromElo(1400));
        assertEquals(Tier.LEGEND, Tier.fromElo(1600));
    }

    @Test
    void statsAndCountersLandOnCard() {
        GamerStats row = GamerStats.fresh(USER);
        row.setElo(1450);
        row.setWins(7);
        row.setDraws(1);
        row.setLosses(2);
        row.setMatchesCount(10);
        row.setTournaments(3);
        when(stats.findById(USER)).thenReturn(Optional.of(row));
        when(listings.countBySellerIdAndStatus(USER, ListingStatus.SOLD)).thenReturn(4L);
        when(listings.countBySoldToUserId(USER)).thenReturn(2L);

        GamerCardResponse card = service.getCard(USER, USER);

        assertEquals(Tier.ELITE, card.tier());
        assertEquals(70, card.winRatePercent());
        assertEquals(4L, card.soldListings());
        assertEquals(2L, card.escrowPurchases());
        assertEquals(3, card.tournaments());
    }

    @Test
    void unknownUserWithNoTracesIs404() {
        when(authSummary.resolve(USER)).thenReturn(Optional.empty());

        MarketplaceException e = assertThrows(MarketplaceException.class, () -> service.getCard(USER, USER));
        assertEquals("gamer_not_found", e.getCode());
    }

    @Test
    void authOutageStillRendersCardForLocallyKnownUser() {
        when(authSummary.resolve(USER)).thenReturn(Optional.empty());
        when(stats.findById(USER)).thenReturn(Optional.of(GamerStats.fresh(USER)));

        GamerCardResponse card = service.getCard(USER, USER);

        assertNull(card.displayName());
        assertEquals(1000, card.elo());
    }
}
