package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdEventPublisher.OfficialPostPayload;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.OfficialChannelPostRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.math.BigDecimal;
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
 * E'lonning efBazaar rasmiy kanalidagi nusxasi.
 *
 * <p>Eng nozik qoida — hamkor tanlanganda nusxa FORWARD bo'lishi.
 * To'g'ridan-to'g'ri joylansa, efBazaar hamkorning auditoriyasidan
 * e'lonni tortib olib o'ziniki qilayotgandek ko'rinardi; forward esa
 * uning hamkorligini tasdiqlaydi.
 */
class OfficialChannelServiceTest {

    private static final String CHANNEL = "@EfBazaar";

    private ListingRepository listings;
    private OfficialChannelPostRepository official;
    private ListingChannelPostRepository posts;
    private PartnerAdEventPublisher events;
    private OfficialChannelService service;

    private final UUID listingId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        listings = mock(ListingRepository.class);
        official = mock(OfficialChannelPostRepository.class);
        posts = mock(ListingChannelPostRepository.class);
        events = mock(PartnerAdEventPublisher.class);
        when(official.save(any())).thenAnswer(i -> i.getArgument(0));
        when(official.existsById(any())).thenReturn(false);
        when(posts.findByListingId(any())).thenReturn(List.of());
        service = build(CHANNEL);
    }

    private OfficialChannelService build(String channel) {
        return new OfficialChannelService(listings, official, posts, events,
                "https://efbazaar.uz", channel);
    }

    private Listing listing() {
        Listing l = new Listing();
        l.setId(listingId);
        l.setPrice(new BigDecimal("4500000"));
        l.setDescription("Akkaunt");
        when(listings.findById(listingId)).thenReturn(Optional.of(l));
        return l;
    }

    private OfficialChannelPost pendingRow() {
        OfficialChannelPost row = new OfficialChannelPost();
        row.setListingId(listingId);
        when(official.findById(listingId)).thenReturn(Optional.of(row));
        return row;
    }

    private OfficialPostPayload captured() {
        var captor = forClass(OfficialPostPayload.class);
        verify(events).officialPostRequested(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("hamkorsiz e'lon to'g'ridan-to'g'ri rasmiy kanalga chiqadi")
    void aListingWithoutPartnersIsPostedDirectly() {
        service.onListingCreated(listing(), false);

        OfficialPostPayload sent = captured();
        assertThat(sent.officialChannel()).isEqualTo(CHANNEL);
        assertThat(sent.caption()).contains("so'm");
        assertThat(sent.sourceMessageId()).isNull();
        // Hamkor kodi YO'Q: bu post hech qaysi hamkorga tegishli emas
        // va undan kelgan savdo ulushi ham yo'q.
        assertThat(sent.buttonUrl()).doesNotContain("?p=");
    }

    @Test
    @DisplayName("hamkor tanlangan bo'lsa yaratilishda hech narsa yuborilmaydi")
    void aListingWithPartnersWaitsForTheirPost() {
        // Nusxa hamkor postidan forward qilinishi kerak va u hali
        // chiqmagan. Hozir yuborsak, keyin ikkita nusxa qolardi.
        service.onListingCreated(listing(), true);

        verify(events, never()).officialPostRequested(any());
    }

    @Test
    @DisplayName("hamkor posti chiqqach rasmiy nusxa FORWARD qilinadi")
    void theOfficialCopyIsForwardedFromThePartner() {
        OfficialChannelPost row = pendingRow();

        service.onPartnerPostDelivered(post("4242"), channel(-1001234L));

        OfficialPostPayload sent = captured();
        assertThat(sent.sourceChannelId()).isEqualTo(-1001234L);
        assertThat(sent.sourceMessageId()).isEqualTo("4242");
        assertThat(row.getSourcePostId()).isNotNull();
    }

    @Test
    @DisplayName("ikkinchi hamkor posti rasmiy kanalga ikkinchi nusxa tushirmaydi")
    void onlyTheFirstPartnerPostBecomesTheSource() {
        // Bir e'lon uch kanalga yuborilsa, uchalasini forward qilish
        // rasmiy kanalga bir akkauntning uch nusxasini tushirardi.
        OfficialChannelPost row = pendingRow();
        row.setSourcePostId(UUID.randomUUID());

        service.onPartnerPostDelivered(post("4242"), channel(-1001234L));

        verify(events, never()).officialPostRequested(any());
    }

    @Test
    @DisplayName("hamma hamkor posti yiqilsa e'lon baribir rasmiy kanalga chiqadi")
    void everyPartnerFailureFallsBackToADirectPost() {
        // Hamkorga chiqara olmaganini e'lonning o'zi bilan jazolash
        // noto'g'ri: e'lon rasmiy kanalga butunlay tushmay qolardi.
        pendingRow();
        listing();

        service.onPartnerPostFailed(listingId);

        assertThat(captured().sourceMessageId()).isNull();
    }

    @Test
    @DisplayName("chiqishi mumkin bo'lgan buyurtma qolsa kutiladi")
    void aPendingOrderIsWaitedFor() {
        // Forward har doim to'g'ridan-to'g'ri joylashdan afzal:
        // sarlavha hamkorlikni tasdiqlaydi.
        pendingRow();
        // E'lon HAM stub qilinadi: usiz publishDirect qo'riqchidan
        // qat'i nazar ishlamas va sinov bo'sh o'tardi.
        listing();
        ListingChannelPost stillHeld = post(null);
        stillHeld.setState(State.HELD.name());
        when(posts.findByListingId(listingId)).thenReturn(List.of(stillHeld));

        service.onPartnerPostFailed(listingId);

        verify(events, never()).officialPostRequested(any());
    }

    @Test
    @DisplayName("kanal sozlanmagan bo'lsa hech narsa yuborilmaydi")
    void anUnconfiguredChannelIsSilent() {
        // Sozlanmagan muhit na yiqilishi, na noto'g'ri joyga post
        // qilishi kerak.
        OfficialChannelService off = build("");

        off.onListingCreated(listing(), false);

        assertThat(off.enabled()).isFalse();
        verify(events, never()).officialPostRequested(any());
    }

    private ListingChannelPost post(String telegramMessageId) {
        ListingChannelPost p = new ListingChannelPost();
        p.setId(UUID.randomUUID());
        p.setListingId(listingId);
        p.setPartnerChannelId(UUID.randomUUID());
        p.setState(State.POSTED.name());
        p.setTelegramMessageId(telegramMessageId);
        return p;
    }

    private PartnerChannel channel(long telegramChannelId) {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setTelegramChannelId(telegramChannelId);
        return c;
    }
}
