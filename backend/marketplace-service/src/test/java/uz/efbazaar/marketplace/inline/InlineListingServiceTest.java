package uz.efbazaar.marketplace.inline;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.partner.ads.ChannelPostCaption;
import uz.efbazaar.marketplace.partner.ads.ListingDeepLink;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/**
 * Telegram inline mode: a seller's own active listings, in the official
 * channel's format. The identity is the Telegram id Telegram attached to the
 * query; nothing else may widen what comes back.
 */
class InlineListingServiceTest {

    static final UUID SELLER = UUID.randomUUID();
    final ListingRepository listings = mock(ListingRepository.class);
    final AuthSummaryClient auth = mock(AuthSummaryClient.class);
    final ListingDeepLink deepLink = new ListingDeepLink("https://efbazaar.uz", "https://t.me/EfBazaarBot/app");
    final InlineListingService service = new InlineListingService(listings, auth, deepLink);

    static Listing listing(String price, Map<String, Object> attrs, List<String> media) {
        return Listing.builder().id(UUID.randomUUID()).sellerId(SELLER).description("Zo'r akkount")
                .price(new BigDecimal(price)).attributes(new HashMap<>(attrs))
                .mediaMessageIds(new ArrayList<>(media)).status(ListingStatus.ACTIVE)
                .createdAt(Instant.now()).build();
    }

    static Map<String, Object> attrs() {
        return Map.of("highest_division_level", 1, "ios_coins", 1200, "android_coins", 800,
                "team_strength", 3245, "valuable_players", List.of("Messi", "Neymar", "Mbappé", "Kaká"));
    }

    void linked() {
        when(auth.resolveByTelegramId(42L)).thenReturn(Optional.of(new AuthSummaryClient.UserSummary(
                SELLER, "Aziz", "aziz", 42L, true, Instant.now(), false)));
    }

    void active(List<Listing> rows) {
        when(listings.findBySellerIdAndStatusOrderByCreatedAtDesc(SELLER, ListingStatus.ACTIVE)).thenReturn(rows);
    }

    @Test
    void anUnlinkedTelegramAccountGetsNothingAndIsToldSo() {
        when(auth.resolveByTelegramId(42L)).thenReturn(Optional.empty());

        var page = service.find(42L, "", 0);

        assertThat(page.linked()).isFalse();
        assertThat(page.items()).isEmpty();
        assertThat(page.nextOffset()).isNull();
        verifyNoInteractions(listings);
    }

    @Test
    void onlyTheSellersActiveListingsAreAsked() {
        linked();
        active(List.of());

        assertThat(service.find(42L, "", 0).linked()).isTrue();

        verify(listings).findBySellerIdAndStatusOrderByCreatedAtDesc(SELLER, ListingStatus.ACTIVE);
        verifyNoMoreInteractions(listings);
    }

    @Test
    void anItemCarriesTheChannelCaptionCoverAndMiniAppButton() {
        linked();
        Listing l = listing("2500000", attrs(), List.of("FILE_COVER", "FILE_2"));
        active(List.of(l));

        var item = service.find(42L, "", 0).items().get(0);

        assertThat(item.listingId()).isEqualTo(l.getId());
        assertThat(item.title()).isEqualTo("2 500 000 so'm · Division 1");
        assertThat(item.description()).isEqualTo("iOS 1200 · Android 800 · Kuch 3245\nMessi, Neymar, Mbappé");
        assertThat(item.captionHtml()).isEqualTo(ChannelPostCaption.of(l, deepLink.webUrl(l.getId(), null)));
        assertThat(item.coverFileId()).isEqualTo("FILE_COVER");
        assertThat(item.buttonUrl()).isEqualTo(deepLink.buttonUrl(l.getId(), null));
    }

    @Test
    void missingAttributesDoNotPrintNull() {
        linked();
        active(List.of(listing("850000", Map.of(), List.of())));

        var item = service.find(42L, "", 0).items().get(0);

        assertThat(item.title()).isEqualTo("850 000 so'm");
        assertThat(item.description()).doesNotContain("null");
        assertThat(item.coverFileId()).isNull();
    }

    @Test
    void theQueryMatchesPlayersOrDescriptionCaseInsensitively() {
        linked();
        Listing messi = listing("1", attrs(), List.of());
        Listing other = listing("2", Map.of("valuable_players", List.of("Haaland")), List.of());
        other.setDescription("Ronaldo ham bor");
        active(List.of(messi, other));

        assertThat(service.find(42L, "MESSI", 0).items())
                .extracting(InlineListingService.InlineListingItem::listingId).containsExactly(messi.getId());
        assertThat(service.find(42L, "ronaldo", 0).items())
                .extracting(InlineListingService.InlineListingItem::listingId).containsExactly(other.getId());
    }

    @Test
    void pagesAreTwentyWithANextOffsetOnlyWhenMoreRemain() {
        linked();
        active(IntStream.range(0, 45).mapToObj(i -> listing("1000", Map.of(), List.of())).toList());

        assertThat(service.find(42L, "", 0).items()).hasSize(20);
        assertThat(service.find(42L, "", 0).nextOffset()).isEqualTo(20);
        assertThat(service.find(42L, "", 40).items()).hasSize(5);
        assertThat(service.find(42L, "", 40).nextOffset()).isNull();
        assertThat(service.find(42L, "", 99).items()).isEmpty();
    }
}
