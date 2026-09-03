package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Kanalga e'lon joylash buyurtmasi.
 *
 * <p>Eng nozik joyi — pul TO'PLAM uchun bir yo'la ushlanishi. Sotuvchi
 * uchta kanalni tanlab, ikkitasini olib qolsa, u rozi bo'lmagan
 * narsani sotib olgan bo'ladi.
 */
class ChannelPostServiceTest {

    private PartnerChannelRepository channels;
    private ListingChannelPostRepository posts;
    private PartnerAdClient payments;
    private PartnerAdEventPublisher events;
    private uz.efbazaar.marketplace.repository.ListingRepository listings;
    private ChannelPostService service;

    private final UUID seller = UUID.randomUUID();
    private final UUID listing = UUID.randomUUID();
    private PartnerChannel cheap;
    private PartnerChannel mid;
    private PartnerChannel dear;

    @BeforeEach
    void setUp() {
        channels = mock(PartnerChannelRepository.class);
        posts = mock(ListingChannelPostRepository.class);
        payments = mock(PartnerAdClient.class);
        events = mock(PartnerAdEventPublisher.class);
        listings = mock(uz.efbazaar.marketplace.repository.ListingRepository.class);
        service = new ChannelPostService(channels, posts, payments, events, new PartnerPricing(), listings);

        cheap = channel("Arzon", new BigDecimal("5000.00"));
        mid = channel("O'rtacha", new BigDecimal("10000.00"));
        dear = channel("Qimmat", new BigDecimal("15000.00"));
        when(posts.saveAll(any())).thenAnswer(i -> List.copyOf(i.getArgument(0)));
        when(posts.findByOrderId(any())).thenReturn(List.of());
    }

    private PartnerChannel channel(String title, BigDecimal price) {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setPartnerUserId(UUID.randomUUID());
        c.setTitle(title);
        c.setPostPriceSom(price);
        c.setActive(true);
        when(channels.findById(c.getId())).thenReturn(Optional.of(c));
        return c;
    }

    @SuppressWarnings("unchecked")
    private List<ListingChannelPost> captureSavedPosts() {
        var saved = forClass(List.class);
        verify(posts).saveAll(saved.capture());
        return (List<ListingChannelPost>) saved.getValue();
    }

    @Test
    @DisplayName("ordering three channels holds one total, not three amounts")
    void holdsTheWholeOrder() {
        service.order(seller, listing, List.of(cheap.getId(), mid.getId(), dear.getId()));

        verify(payments).hold(any(), eq(seller), eq(new BigDecimal("30000.00")));
        verify(payments, never()).hold(any(), any(), eq(new BigDecimal("5000.00")));
    }

    @Test
    @DisplayName("every post in an order shares its order id")
    void oneOrderIdPerAction() {
        service.order(seller, listing, List.of(cheap.getId(), mid.getId()));

        var saved = captureSavedPosts();
        assertThat(saved).extracting(ListingChannelPost::getOrderId)
                .containsOnly(saved.get(0).getOrderId());
    }

    @Test
    @DisplayName("the price is frozen at order time")
    void priceIsFrozen() {
        service.order(seller, listing, List.of(cheap.getId()));
        assertThat(captureSavedPosts().get(0).getPriceSom()).isEqualByComparingTo("5000.00");
    }

    @Test
    @DisplayName("an inactive channel cannot be ordered")
    void inactiveChannelRejected() {
        cheap.setActive(false);

        assertThatThrownBy(() -> service.order(seller, listing, List.of(cheap.getId())))
                .isInstanceOf(ResponseStatusException.class);
        verify(payments, never()).hold(any(), any(), any());
    }

    @Test
    @DisplayName("a channel that does not exist cannot be ordered")
    void unknownChannelRejected() {
        assertThatThrownBy(() -> service.order(seller, listing, List.of(UUID.randomUUID())))
                .isInstanceOf(ResponseStatusException.class);
        verify(payments, never()).hold(any(), any(), any());
    }

    @Test
    @DisplayName("a wallet that cannot cover the total orders nothing at all")
    void allOrNothing() {
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT,
                "Hamyonda mablag' yetarli emas — 2000 so'm yetishmayapti"))
                .when(payments).hold(any(), any(), any());

        service.order(seller, listing, List.of(cheap.getId(), mid.getId()));

        // E'lon yo'qolmaydi va buyurtma AWAITING_FUNDS bo'lib turadi —
        // to'ldirilgan hamyon bilan "To'lash" tugmasi uni davom ettiradi.
        assertThat(captureSavedPosts())
                .allMatch(p -> State.AWAITING_FUNDS.name().equals(p.getState()));
    }

    @Test
    @DisplayName("nothing is published to the bot when the money never moved")
    void noEventWithoutFunds() {
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Hamyonda mablag' yetarli emas"))
                .when(payments).hold(any(), any(), any());

        service.order(seller, listing, List.of(cheap.getId()));

        verify(events, never()).postRequested(any(), any());
    }

    @Test
    @DisplayName("a successful hold marks every post held and asks the bot to publish")
    void successMarksHeldAndPublishes() {
        service.order(seller, listing, List.of(cheap.getId(), mid.getId()));

        assertThat(captureSavedPosts()).allMatch(p -> State.HELD.name().equals(p.getState()));
        verify(events, org.mockito.Mockito.times(2)).postRequested(any(), any());
    }

    // ---- bot natijasi ----

    private ListingChannelPost held(PartnerChannel channel) {
        ListingChannelPost p = new ListingChannelPost();
        p.setId(UUID.randomUUID());
        p.setOrderId(UUID.randomUUID());
        p.setListingId(listing);
        p.setPartnerChannelId(channel.getId());
        p.setPriceSom(channel.getPostPriceSom());
        p.setState(State.HELD.name());
        when(posts.findById(p.getId())).thenReturn(Optional.of(p));

        uz.efbazaar.marketplace.domain.Listing l = new uz.efbazaar.marketplace.domain.Listing();
        l.setId(listing);
        l.setSellerId(seller);
        when(listings.findById(listing)).thenReturn(Optional.of(l));
        return p;
    }

    @Test
    @DisplayName("a delivered post pays the partner")
    void deliveredPostPays() {
        ListingChannelPost post = held(cheap);

        service.onPosted(post.getId(), "4242");

        assertThat(post.getState()).isEqualTo(State.POSTED.name());
        assertThat(post.getTelegramMessageId()).isEqualTo("4242");
        verify(payments).settle(eq(post.getId()), eq(seller), eq(cheap.getPartnerUserId()),
                eq(new BigDecimal("5000.00")));
    }

    @Test
    @DisplayName("a failed post refunds the seller")
    void failedPostRefunds() {
        ListingChannelPost post = held(cheap);

        service.onFailed(post.getId(), "bot is not an administrator");

        assertThat(post.getState()).isEqualTo(State.REFUNDED.name());
        assertThat(post.getError()).isEqualTo("bot is not an administrator");
        verify(payments).refund(eq(post.getId()), eq(seller), eq(new BigDecimal("5000.00")));
    }

    @Test
    @DisplayName("a redelivered result pays once")
    void redeliveryPaysOnce() {
        ListingChannelPost post = held(cheap);
        post.setState(State.POSTED.name());

        service.onPosted(post.getId(), "4242");

        verify(payments, never()).settle(any(), any(), any(), any());
    }

    @Test
    @DisplayName("a result for a post nobody ordered is ignored, not an error")
    void unknownPostIgnored() {
        when(posts.findById(any())).thenReturn(Optional.empty());

        org.assertj.core.api.Assertions.assertThatCode(
                () -> service.onPosted(UUID.randomUUID(), "1")).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("the seller comes from the listing, not from what the bot sent")
    void sellerIsResolvedLocally() {
        // Bot e'lon kimniki ekanini bilmaydi va bilishi ham kerak emas.
        ListingChannelPost post = held(cheap);

        service.onPosted(post.getId(), "4242");

        verify(listings).findById(listing);
    }

    @Test
    @DisplayName("cancelling a partnership refunds what never shipped")
    void refundsStrandedOrders() {
        ListingChannelPost stranded = held(cheap);
        when(posts.findByPartnerChannelIdAndState(cheap.getId(), State.HELD.name()))
                .thenReturn(List.of(stranded));

        service.refundStranded(cheap.getId());

        verify(payments).refund(eq(stranded.getId()), eq(seller), eq(new BigDecimal("5000.00")));
        assertThat(stranded.getState()).isEqualTo(State.REFUNDED.name());
        assertThat(stranded.getError()).isEqualTo("Hamkorlik to'xtatildi");
    }

    @Test
    @DisplayName("a delivered post is left alone when the partnership ends")
    void deliveredPostsSurviveCancellation() {
        // Reklama yetkazilgan va to'langan; u keltirgan savdolar ham
        // to'lanaveradi, chunki `trades` dagi muhrlangan qiymat
        // kanalning faolligiga qaramaydi.
        when(posts.findByPartnerChannelIdAndState(cheap.getId(), State.HELD.name()))
                .thenReturn(List.of());

        service.refundStranded(cheap.getId());

        verify(payments, never()).refund(any(), any(), any());
    }

    @Test
    @DisplayName("one stranded refund failing does not strand the rest")
    void oneRefundFailureDoesNotStopTheRest() {
        ListingChannelPost first = held(cheap);
        ListingChannelPost second = held(mid);
        when(posts.findByPartnerChannelIdAndState(cheap.getId(), State.HELD.name()))
                .thenReturn(List.of(first, second));
        doThrow(new RuntimeException("payment down"))
                .when(payments).refund(eq(first.getId()), any(), any());

        service.refundStranded(cheap.getId());

        // Ular boshqa-boshqa sotuvchilarning puli — biri tufayli
        // ikkinchisini muzlatib qo'yish sababsiz.
        verify(payments).refund(eq(second.getId()), any(), any());
    }

    @Test
    @DisplayName("an empty selection orders nothing and charges nothing")
    void emptySelection() {
        service.order(seller, listing, List.of());

        verify(payments, never()).hold(any(), any(), any());
        verify(posts, never()).saveAll(any());
    }

    @Test
    @DisplayName("the same channel picked twice is charged once")
    void duplicateSelection() {
        // Frontend takrorlashi mumkin; baza esa (listing, channel) ni
        // yagona deb biladi va ikkinchi qator INSERT'da yiqilardi.
        service.order(seller, listing, List.of(cheap.getId(), cheap.getId()));

        verify(payments).hold(any(), eq(seller), eq(new BigDecimal("5000.00")));
        assertThat(captureSavedPosts()).hasSize(1);
    }
}
