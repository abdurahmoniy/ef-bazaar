package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Olib tashlangan e'lon kanallardan ham ketadimi.
 *
 * <p>Ilgari e'lon efBazaar'dan o'chirilar, kanallardagi nusxalari esa
 * tugmasi bilan tirik qolardi — olib tashlanayotgan narsa reklama
 * qilinishda davom etardi. Bu yerdagi sinovlar shu holat qaytmasligini
 * qo'riqlaydi.
 */
class ChannelTakedownTest {

    private ListingChannelPostRepository posts;
    private PartnerChannelRepository channels;
    private OfficialChannelService official;
    private ChannelPostService channelPosts;
    private PartnerAdEventPublisher events;
    private ChannelTakedown takedown;

    private final UUID listingId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        posts = mock(ListingChannelPostRepository.class);
        channels = mock(PartnerChannelRepository.class);
        official = mock(OfficialChannelService.class);
        channelPosts = mock(ChannelPostService.class);
        events = mock(PartnerAdEventPublisher.class);
        when(posts.findByListingId(any())).thenReturn(List.of());
        takedown = new ChannelTakedown(posts, channels, official, channelPosts, events);
    }

    private Listing listing() {
        Listing l = new Listing();
        l.setId(listingId);
        return l;
    }

    private PartnerChannel channel() {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setTelegramChannelId(-1001234L);
        when(channels.findById(c.getId())).thenReturn(Optional.of(c));
        return c;
    }

    private ListingChannelPost post(PartnerChannel channel, String messageId, State state) {
        ListingChannelPost p = new ListingChannelPost();
        p.setId(UUID.randomUUID());
        p.setListingId(listingId);
        p.setPartnerChannelId(channel.getId());
        p.setTelegramMessageId(messageId);
        p.setState(state.name());
        return p;
    }

    @Test
    void tirikPostKanaldanOchiriladiVaBelgilanadi() {
        PartnerChannel ch = channel();
        ListingChannelPost live = post(ch, "9001", State.POSTED);
        when(posts.findByListingId(listingId)).thenReturn(List.of(live));

        takedown.onRemoved(listing());

        verify(events).postDeleteRequested(live, ch);
        assertThat(live.getRemovedAt()).isNotNull();
        verify(posts).save(live);
    }

    @Test
    void rasmiyKanaldagiNusxaHamOlinadi() {
        takedown.onRemoved(listing());

        verify(official).onListingRemoved(listingId);
    }

    /** Almashtirilgan post kanalda allaqachon yo'q — uni o'chirish xato beradi. */
    @Test
    void almashtirilganPostgaTegilmaydi() {
        PartnerChannel ch = channel();
        ListingChannelPost replaced = post(ch, "9001", State.POSTED);
        replaced.setReplacedAt(Instant.now());
        when(posts.findByListingId(listingId)).thenReturn(List.of(replaced));

        takedown.onRemoved(listing());

        verify(events, never()).postDeleteRequested(any(), any());
    }

    /** Ikki marta o'chirish so'rovi yuborilmaydi. */
    @Test
    void allaqachonOlinganPostQaytaOchirilmaydi() {
        PartnerChannel ch = channel();
        ListingChannelPost already = post(ch, "9001", State.POSTED);
        already.setRemovedAt(Instant.now());
        when(posts.findByListingId(listingId)).thenReturn(List.of(already));

        takedown.onRemoved(listing());

        verify(events, never()).postDeleteRequested(any(), any());
    }

    @Test
    void chiqmaganPostlarOchirilmaydi() {
        PartnerChannel ch = channel();
        when(posts.findByListingId(listingId)).thenReturn(List.of(
                post(ch, null, State.HELD),
                post(ch, null, State.AWAITING_FUNDS),
                post(ch, "9002", State.FAILED),
                post(ch, "9003", State.REFUNDED)));

        takedown.onRemoved(listing());

        verify(events, never()).postDeleteRequested(any(), any());
    }

    /**
     * Xabar identifikatorisiz o'chirib bo'lmaydi: post chiqqan, lekin bot
     * identifikatorni qaytarmagan holat.
     */
    @Test
    void identifikatorsizPostOtkazibYuboriladi() {
        PartnerChannel ch = channel();
        when(posts.findByListingId(listingId)).thenReturn(List.of(
                post(ch, null, State.POSTED), post(ch, "  ", State.POSTED)));

        takedown.onRemoved(listing());

        verify(events, never()).postDeleteRequested(any(), any());
    }

    /** Kanal o'chirilgan bo'lsa manzil yo'q — jimgina o'tkazib yuboriladi. */
    @Test
    void yoqolganKanalYiqitmaydi() {
        PartnerChannel ch = new PartnerChannel();
        ch.setId(UUID.randomUUID());
        when(channels.findById(ch.getId())).thenReturn(Optional.empty());
        when(posts.findByListingId(listingId)).thenReturn(List.of(post(ch, "9001", State.POSTED)));

        takedown.onRemoved(listing());

        verify(events, never()).postDeleteRequested(any(), any());
    }

    @Test
    void tiklashIkkalaKanalniHamQaytaradi() {
        Listing l = listing();

        takedown.onRestored(l);

        verify(channelPosts).republishRemoved(listingId);
        verify(official).onListingRestored(l);
    }
}
