package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.AccountRequestStatus;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatAccountRequest;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatAccountRequestRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Who ends up buying, and which account.
 *
 * <p>Both answers used to be implicit — {@code chats.buyer_id} decided the
 * roles for the life of the chat, and the listing was whichever one the chat
 * happened to be created from. A pair could therefore trade once, in one
 * direction, about one account.
 */
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;

@ExtendWith(MockitoExtension.class)
class ChatAccountRequestServiceTest {

    @Mock ChatAccountRequestRepository requests;
    @Mock ChatRepository chats;
    @Mock ListingRepository listings;
    @Mock ChatParticipantRepository participants;
    @Mock MarketplaceEventPublisher events;
    @Mock NotificationService notifications;
    @InjectMocks ChatAccountRequestService service;

    private UUID chatId;
    private UUID alice;   // chats.buyer_id
    private UUID bob;     // chats.seller_id
    private Chat chat;

    @BeforeEach
    void setUp() {
        chatId = UUID.randomUUID();
        alice = UUID.randomUUID();
        bob = UUID.randomUUID();
        chat = Chat.builder().id(chatId).buyerId(alice).sellerId(bob)
                .listingId(UUID.randomUUID()).build();
    }

    private Listing listingOf(UUID owner, ListingStatus status) {
        Listing l = new Listing();
        l.setId(UUID.randomUUID());
        l.setSellerId(owner);
        l.setStatus(status);
        return l;
    }

    private void chatExists() {
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
    }

    private ChatAccountRequest openRequest(UUID requester, UUID listingId) {
        return ChatAccountRequest.builder()
                .id(UUID.randomUUID()).chatId(chatId)
                .requesterId(requester).listingId(listingId)
                .status(AccountRequestStatus.OPEN).build();
    }

    @Test
    void theRequesterBecomesTheBuyer() {
        chatExists();
        Listing bobs = listingOf(bob, ListingStatus.ACTIVE);
        when(listings.findById(bobs.getId())).thenReturn(Optional.of(bobs));
        when(requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN))
                .thenReturn(Optional.empty());
        when(requests.save(any())).thenAnswer(i -> i.getArgument(0));

        ChatAccountRequest req = service.open(alice, chatId, bobs.getId());

        assertThat(req.getRequesterId()).isEqualTo(alice);
        assertThat(req.getListingId()).isEqualTo(bobs.getId());
    }

    @Test
    void theChatsSellerMayAlsoBuy() {
        // The direction that was impossible before: bob is chats.seller_id, yet
        // he is the one asking to buy one of alice's accounts.
        chatExists();
        Listing alices = listingOf(alice, ListingStatus.ACTIVE);
        when(listings.findById(alices.getId())).thenReturn(Optional.of(alices));
        when(requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN))
                .thenReturn(Optional.empty());
        when(requests.save(any())).thenAnswer(i -> i.getArgument(0));

        ChatAccountRequest req = service.open(bob, chatId, alices.getId());

        assertThat(req.getRequesterId()).as("bob is the buyer this time").isEqualTo(bob);
    }

    @Test
    void pickingAnotherAccountClosesTheOldRequestBeforeOpeningTheNew() {
        // Hibernate flushes inserts before updates, so a plain save() would send
        // the new OPEN row while the old one is still OPEN and hit
        // uk_car_open_per_chat. The close has to be flushed first.
        chatExists();
        Listing second = listingOf(bob, ListingStatus.ACTIVE);
        when(listings.findById(second.getId())).thenReturn(Optional.of(second));
        ChatAccountRequest previous = openRequest(alice, UUID.randomUUID());
        when(requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN))
                .thenReturn(Optional.of(previous));
        when(requests.save(any())).thenAnswer(i -> i.getArgument(0));

        service.open(alice, chatId, second.getId());

        InOrder order = inOrder(requests);
        order.verify(requests).saveAndFlush(previous);
        order.verify(requests).save(any());
        assertThat(previous.getStatus()).isEqualTo(AccountRequestStatus.CANCELLED);
        assertThat(previous.getClosedAt()).as("chk_car_closed_at").isNotNull();
    }

    @Test
    void askingTwiceForTheSameAccountChangesNothing() {
        chatExists();
        Listing bobs = listingOf(bob, ListingStatus.ACTIVE);
        when(listings.findById(bobs.getId())).thenReturn(Optional.of(bobs));
        ChatAccountRequest existing = openRequest(alice, bobs.getId());
        when(requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN))
                .thenReturn(Optional.of(existing));

        ChatAccountRequest req = service.open(alice, chatId, bobs.getId());

        assertThat(req).isSameAs(existing);
        verify(requests, never()).save(any());
        verify(requests, never()).saveAndFlush(any());
    }

    @Test
    void youCannotAskToBuyYourOwnAccount() {
        chatExists();
        Listing mine = listingOf(alice, ListingStatus.ACTIVE);
        when(listings.findById(mine.getId())).thenReturn(Optional.of(mine));

        assertThatThrownBy(() -> service.open(alice, chatId, mine.getId()))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("O'z e'loningiz");
    }

    @Test
    void aThirdPartysListingIsRefused() {
        // The picker only offers the partner's listings, so this is hand-built.
        chatExists();
        Listing strangers = listingOf(UUID.randomUUID(), ListingStatus.ACTIVE);
        when(listings.findById(strangers.getId())).thenReturn(Optional.of(strangers));

        assertThatThrownBy(() -> service.open(alice, chatId, strangers.getId()))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("suhbatdoshingizga tegishli emas");
    }

    @Test
    void aSoldAccountCannotBeRequested() {
        chatExists();
        Listing sold = listingOf(bob, ListingStatus.SOLD);
        when(listings.findById(sold.getId())).thenReturn(Optional.of(sold));

        assertThatThrownBy(() -> service.open(alice, chatId, sold.getId()))
                .isInstanceOf(MarketplaceException.class);
    }

    @Test
    void anOutsiderCannotTouchTheChat() {
        chatExists();

        assertThatThrownBy(() -> service.open(UUID.randomUUID(), chatId, UUID.randomUUID()))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("ishtirok etmaysiz");
    }

    @Test
    void openingRequestNotifiesPartnerAndEmitsEvent() {
        chatExists();
        Listing listing2 = listingOf(bob, ListingStatus.ACTIVE);
        when(listings.findById(listing2.getId())).thenReturn(Optional.of(listing2));
        when(requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN))
                .thenReturn(Optional.empty());
        when(requests.save(any())).thenAnswer(i -> i.getArgument(0));

        service.open(alice, chatId, listing2.getId());

        verify(events).chatCreated(chatId, listing2.getId(), alice, bob);
        verify(notifications).accountRequested(eq(bob), eq(chatId), eq(listing2.getId()), any());
        verify(chats).save(chat);
        assertThat(chat.getListingId()).isEqualTo(listing2.getId());
    }
}
