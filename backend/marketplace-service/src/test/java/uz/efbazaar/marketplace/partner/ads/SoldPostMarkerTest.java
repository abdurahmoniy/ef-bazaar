package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdEventPublisher.PostEditPayload;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.OfficialChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Sotilgan e'lonning kanallardagi nusxalari.
 *
 * <p>Post o'chirilmaydi — hamkor to'lov olgan reklamasini yo'qotardi.
 * Ustidan chiziladi va TUGMASI olinadi: ustidan chizilgan matnni
 * o'qimagan odam ham tugmani bosib, mavjud bo'lmagan taklifga borardi.
 */
class SoldPostMarkerTest {

    private ListingChannelPostRepository posts;
    private PartnerChannelRepository channels;
    private OfficialChannelPostRepository official;
    private PartnerAdEventPublisher events;
    private SoldPostMarker marker;

    private final UUID listingId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        posts = mock(ListingChannelPostRepository.class);
        channels = mock(PartnerChannelRepository.class);
        official = mock(OfficialChannelPostRepository.class);
        events = mock(PartnerAdEventPublisher.class);
        when(posts.findByListingId(any())).thenReturn(List.of());
        when(official.findById(any())).thenReturn(Optional.empty());
        marker = new SoldPostMarker(posts, channels, official, events,
                "https://efbazaar.uz", "@EfBazaar");
    }

    private Listing listing() {
        Listing l = new Listing();
        l.setId(listingId);
        l.setPrice(new BigDecimal("4500000"));
        l.setDescription("Akkaunt");
        return l;
    }

    private PartnerChannel channel() {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setTelegramChannelId(-1001234L);
        c.setLinkCode("K7M4XQP2");
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

    private PostEditPayload captured() {
        var captor = forClass(PostEditPayload.class);
        verify(events).postEditRequested(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("chiqib bo'lgan post SOTILDI deb belgilanadi va havolasi olinadi")
    void aLivePostIsStruckThrough() {
        PartnerChannel c = channel();
        when(posts.findByListingId(listingId)).thenReturn(List.of(post(c, "4242", State.POSTED)));

        marker.onSold(listing());

        PostEditPayload sent = captured();
        assertThat(sent.chatId()).isEqualTo("-1001234");
        assertThat(sent.telegramMessageId()).isEqualTo("4242");
        assertThat(sent.html()).startsWith("<b>❌ SOTILDI</b>");
        assertThat(sent.html()).contains("<s>");
        assertThat(sent.html()).doesNotContain("href");
    }

    @Test
    @DisplayName("almashtirilgan post tahrirlanmaydi — u kanalda yo'q")
    void aReplacedPostIsSkipped() {
        // Qayta yuborilganda eskisi kanaldan o'chirilgan. Uni
        // tahrirlash Telegram xatosini beradi va logni to'ldiradi.
        PartnerChannel c = channel();
        ListingChannelPost replaced = post(c, "1111", State.POSTED);
        replaced.setReplacedAt(Instant.now());
        when(posts.findByListingId(listingId)).thenReturn(List.of(replaced));

        marker.onSold(listing());

        verify(events, never()).postEditRequested(any());
    }

    @Test
    @DisplayName("chiqmagan post tahrirlanmaydi")
    void anUndeliveredPostIsSkipped() {
        PartnerChannel c = channel();
        when(posts.findByListingId(listingId))
                .thenReturn(List.of(post(c, null, State.AWAITING_FUNDS)));

        marker.onSold(listing());

        verify(events, never()).postEditRequested(any());
    }

    @Test
    @DisplayName("rasmiy kanaldagi nusxa ham belgilanadi")
    void theOfficialCopyIsMarkedToo() {
        // U ham kanalda "sotuvda" bo'lib turaveradi va uni bosgan odam
        // mavjud bo'lmagan taklifga borardi.
        OfficialChannelPost row = new OfficialChannelPost();
        row.setListingId(listingId);
        row.setState(OfficialChannelPost.State.POSTED.name());
        row.setTelegramMessageId("777");
        when(official.findById(listingId)).thenReturn(Optional.of(row));

        marker.onSold(listing());

        PostEditPayload sent = captured();
        assertThat(sent.chatId()).isEqualTo("@EfBazaar");
        assertThat(sent.telegramMessageId()).isEqualTo("777");
        assertThat(sent.html()).startsWith("<b>❌ SOTILDI</b>");
    }
}
