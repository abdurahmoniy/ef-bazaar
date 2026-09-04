package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Mavjud e'lonni kanallarga joylash.
 *
 * <p>Bu yerdagi har bir shart PUL harakatini to'sadi: noto'g'ri
 * o'tkazilgan tekshiruv birovning hamyonidan yechadi yoki hech kim
 * ko'ra olmaydigan narsani reklama qiladi.
 */
class ListingChannelPostServiceTest {

    private ListingRepository listings;
    private ListingChannelPostRepository posts;
    private PartnerChannelRepository channels;
    private ChannelPostService channelPosts;
    private ListingChannelPostService service;

    private final UUID seller = UUID.randomUUID();
    private final UUID listingId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        listings = mock(ListingRepository.class);
        posts = mock(ListingChannelPostRepository.class);
        channels = mock(PartnerChannelRepository.class);
        channelPosts = mock(ChannelPostService.class);
        service = new ListingChannelPostService(listings, posts, channels, channelPosts);
    }

    private Listing listing(ListingStatus status) {
        Listing l = new Listing();
        l.setId(listingId);
        l.setSellerId(seller);
        l.setStatus(status);
        when(listings.findById(listingId)).thenReturn(Optional.of(l));
        return l;
    }

    @Test
    @DisplayName("faol e'lon kanallarga joylanadi")
    void anActiveListingIsOrdered() {
        listing(ListingStatus.ACTIVE);
        UUID channel = UUID.randomUUID();

        service.order(seller, listingId, List.of(channel));

        verify(channelPosts).order(seller, listingId, List.of(channel));
    }

    @Test
    @DisplayName("sotilgan e'lon reklama qilinmaydi")
    void aSoldListingCannotBeAdvertised() {
        // Post chiqar, uni bosgan odam esa mavjud bo'lmagan taklifga
        // tushardi — sotuvchi buning uchun to'lagan holda.
        listing(ListingStatus.SOLD);

        assertThatThrownBy(() -> service.order(seller, listingId, List.of(UUID.randomUUID())))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(HttpStatus.CONFLICT));
        verify(channelPosts, never()).order(any(), any(), any());
    }

    @Test
    @DisplayName("birovning e'loni uchun buyurtma berib bo'lmaydi")
    void anotherSellersListingIsNotOrderable() {
        // Bu so'rovchining o'z hamyonidan pul yechardi va begona
        // e'lonni uning hisobidan reklama qilardi.
        listing(ListingStatus.ACTIVE);

        assertThatThrownBy(() -> service.order(UUID.randomUUID(), listingId, List.of(UUID.randomUUID())))
                .isInstanceOf(ResponseStatusException.class);
        verify(channelPosts, never()).order(any(), any(), any());
    }

    @Test
    @DisplayName("qayta yuborishdan oldin: qaysi kanalda necha marta chiqqani")
    void postedChannelsCountOnlyDeliveredPosts() {
        // Sotuvchi qayta to'lashdan oldin shuni ko'radi. To'lovni
        // kutayotgan urinishni "kanalda turibdi" deb sanasak, u
        // chiqmagan narsa uchun qayta to'lashdan tiyilardi.
        listing(ListingStatus.ACTIVE);
        PartnerChannel channel = new PartnerChannel();
        channel.setId(UUID.randomUUID());
        channel.setTitle("Efootball Uz");
        channel.setPostPriceSom(new BigDecimal("25000"));
        channel.setActive(true);
        when(channels.findAllById(any())).thenReturn(List.of(channel));

        when(posts.findByListingIdOrderByCreatedAtDesc(listingId)).thenReturn(List.of(
                post(channel.getId(), State.POSTED, Instant.parse("2026-09-03T10:00:00Z")),
                post(channel.getId(), State.POSTED, Instant.parse("2026-09-01T10:00:00Z")),
                post(channel.getId(), State.AWAITING_FUNDS, null)));

        var found = service.postedChannels(seller, listingId);

        assertThat(found).singleElement().satisfies(c -> {
            assertThat(c.postedCount()).isEqualTo(2);
            assertThat(c.lastPostedAt()).isEqualTo(Instant.parse("2026-09-03T10:00:00Z"));
            // BUGUNGI narx: hamkor uni oradagi vaqtda o'zgartirgan
            // bo'lishi mumkin va sotuvchi shuni to'laydi.
            assertThat(c.currentPriceSom()).isEqualByComparingTo("25000");
        });
    }

    private ListingChannelPost post(UUID channelId, State state, Instant postedAt) {
        ListingChannelPost p = new ListingChannelPost();
        p.setId(UUID.randomUUID());
        p.setListingId(listingId);
        p.setPartnerChannelId(channelId);
        p.setState(state.name());
        p.setPostedAt(postedAt);
        return p;
    }
}
