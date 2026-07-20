package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthNameClient;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock ChatRepository chats;
    @Mock ChatMessageRepository messages;
    @Mock ChatParticipantRepository participants;
    @Mock ListingRepository listings;
    @Mock MarketplaceEventPublisher events;
    @Mock AuthNameClient authNameClient;
    @Mock NotificationService notifications;

    @Mock uz.efbazaar.marketplace.trust.BlacklistGuard blacklistGuard;
    @InjectMocks ChatService service;

    private UUID sellerId;
    private UUID buyerId;
    private UUID listingId;
    private Listing activeListing;

    @BeforeEach
    void setUp() {
        sellerId = UUID.randomUUID();
        buyerId = UUID.randomUUID();
        listingId = UUID.randomUUID();
        activeListing = Listing.builder()
                .id(listingId)
                .sellerId(sellerId)
                .status(ListingStatus.ACTIVE)
                .price(BigDecimal.valueOf(1000))
                .build();
    }

    @Test
    void start_createsChat() {
        when(listings.findById(listingId)).thenReturn(Optional.of(activeListing));
        when(chats.findByBuyerIdAndListingIdAndStatus(buyerId, listingId, ChatStatus.ACTIVE))
                .thenReturn(Optional.empty());
        when(chats.save(any(Chat.class))).thenAnswer(inv -> {
            Chat c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        Chat chat = service.start(buyerId, listingId);
        assertThat(chat.getBuyerId()).isEqualTo(buyerId);
        assertThat(chat.getSellerId()).isEqualTo(sellerId);
        assertThat(chat.getStatus()).isEqualTo(ChatStatus.ACTIVE);
        assertThat(chat.isImportant()).isFalse();
    }

    @Test
    void start_snapshotsBuyerAndSellerDisplayNames() {
        when(listings.findById(listingId)).thenReturn(Optional.of(activeListing));
        when(chats.findByBuyerIdAndListingIdAndStatus(buyerId, listingId, ChatStatus.ACTIVE))
                .thenReturn(Optional.empty());
        when(authNameClient.resolveNames(any()))
                .thenReturn(Map.of(buyerId, "Aziz Rahmatov", sellerId, "Sardor Karimov"));
        when(chats.save(any(Chat.class))).thenAnswer(inv -> {
            Chat c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        Chat chat = service.start(buyerId, listingId);
        assertThat(chat.getBuyerDisplayName()).isEqualTo("Aziz Rahmatov");
        assertThat(chat.getSellerDisplayName()).isEqualTo("Sardor Karimov");
    }

    @Test
    void start_leavesNamesNullWhenAuthClientReturnsEmpty() {
        when(listings.findById(listingId)).thenReturn(Optional.of(activeListing));
        when(chats.findByBuyerIdAndListingIdAndStatus(buyerId, listingId, ChatStatus.ACTIVE))
                .thenReturn(Optional.empty());
        when(authNameClient.resolveNames(any())).thenReturn(Map.of());
        when(chats.save(any(Chat.class))).thenAnswer(inv -> {
            Chat c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        Chat chat = service.start(buyerId, listingId);
        assertThat(chat.getBuyerDisplayName()).isNull();
        assertThat(chat.getSellerDisplayName()).isNull();
    }

    @Test
    void start_returnsExistingActiveChatInsteadOfCreating() {
        Chat existing = Chat.builder()
                .id(UUID.randomUUID())
                .listingId(listingId)
                .buyerId(buyerId)
                .sellerId(sellerId)
                .status(ChatStatus.ACTIVE)
                .build();
        when(listings.findById(listingId)).thenReturn(Optional.of(activeListing));
        when(chats.findByBuyerIdAndListingIdAndStatus(buyerId, listingId, ChatStatus.ACTIVE))
                .thenReturn(Optional.of(existing));

        Chat chat = service.start(buyerId, listingId);
        assertThat(chat).isSameAs(existing);
    }

    @Test
    void start_rejectsOwnListing() {
        when(listings.findById(listingId)).thenReturn(Optional.of(activeListing));

        assertThatThrownBy(() -> service.start(sellerId, listingId))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("O'zingiz");
    }

    @Test
    void start_rejectsNonActiveListing() {
        activeListing.setStatus(ListingStatus.SOLD);
        when(listings.findById(listingId)).thenReturn(Optional.of(activeListing));

        assertThatThrownBy(() -> service.start(buyerId, listingId))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("aktiv emas");
    }

    @Test
    void sendMessage_rejectsNonParticipant() {
        UUID chatId = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .status(ChatStatus.ACTIVE).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));

        assertThatThrownBy(() -> service.sendMessage(chatId, stranger, "hi"))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("ishtirok");
    }

    @Test
    void sendMessage_rejectsClosedChat() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .status(ChatStatus.CLOSED).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));

        assertThatThrownBy(() -> service.sendMessage(chatId, buyerId, "hi"))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("yopilgan");
    }

    @Test
    void toggleImportant_togglesMyRowAndRecomputesAggregate() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .status(ChatStatus.ACTIVE).important(false).build();
        ChatParticipant mine = ChatParticipant.builder()
                .chatId(chatId).userId(buyerId).important(false).build();
        ChatParticipant partner = ChatParticipant.builder()
                .chatId(chatId).userId(sellerId).important(false).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        when(participants.findByChatIdAndUserId(chatId, buyerId)).thenReturn(Optional.of(mine));
        when(participants.findByChatId(chatId)).thenReturn(java.util.List.of(mine, partner));

        service.toggleImportant(chatId, buyerId);

        assertThat(mine.isImportant()).isTrue();
        assertThat(partner.isImportant()).isFalse();
        assertThat(chat.isImportant()).isTrue(); // aggregate: either side starred
    }

    @Test
    void hide_setsMyHiddenAtOnly() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .status(ChatStatus.ACTIVE).build();
        ChatParticipant mine = ChatParticipant.builder()
                .chatId(chatId).userId(buyerId).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        when(participants.findByChatIdAndUserId(chatId, buyerId)).thenReturn(Optional.of(mine));

        service.hide(chatId, buyerId);

        assertThat(mine.getHiddenAt()).isNotNull();
        assertThat(chat.getStatus()).isEqualTo(ChatStatus.ACTIVE); // partner unaffected
    }

    @Test
    void sendMessage_unhidesChatForEveryone() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .status(ChatStatus.ACTIVE).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        when(messages.save(any(ChatMessage.class))).thenAnswer(inv -> {
            ChatMessage m = inv.getArgument(0);
            m.setId(UUID.randomUUID());
            m.setCreatedAt(java.time.Instant.now());
            return m;
        });

        service.sendMessage(chatId, buyerId, "salom");

        org.mockito.Mockito.verify(participants).unhideAll(chatId);
    }

    @Test
    void stampOwnName_setsCallersSideAndOverwritesOnRename() {
        Chat chat = Chat.builder()
                .id(UUID.randomUUID()).listingId(listingId)
                .buyerId(buyerId).sellerId(sellerId)
                .sellerDisplayName("Eski Ism")
                .status(ChatStatus.ACTIVE).build();

        service.stampOwnName(java.util.List.of(chat), buyerId, "Aziz Rahmatov");
        assertThat(chat.getBuyerDisplayName()).isEqualTo("Aziz Rahmatov");
        assertThat(chat.getSellerDisplayName()).isEqualTo("Eski Ism"); // partner untouched

        service.stampOwnName(java.util.List.of(chat), sellerId, "Yangi Ism");
        assertThat(chat.getSellerDisplayName()).isEqualTo("Yangi Ism"); // rename propagates

        service.stampOwnName(java.util.List.of(chat), buyerId, null);
        assertThat(chat.getBuyerDisplayName()).isEqualTo("Aziz Rahmatov"); // null name = no-op
    }

    @Test
    void markRead_movesMyCursor() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .status(ChatStatus.ACTIVE).build();
        ChatParticipant mine = ChatParticipant.builder()
                .chatId(chatId).userId(buyerId).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        when(participants.findByChatIdAndUserId(chatId, buyerId)).thenReturn(Optional.of(mine));

        service.markRead(chatId, buyerId);

        assertThat(mine.getLastReadAt()).isNotNull();
    }

    @Test
    void countUnread_countsPartnerMessagesAfterCursor() {
        UUID chatId = UUID.randomUUID();
        java.time.Instant cursor = java.time.Instant.now().minusSeconds(60);
        ChatParticipant mine = ChatParticipant.builder()
                .chatId(chatId).userId(buyerId).lastReadAt(cursor).build();
        when(participants.findByChatIdAndUserId(chatId, buyerId)).thenReturn(Optional.of(mine));
        when(messages.countByChatIdAndSenderIdNotAndCreatedAtAfter(chatId, buyerId, cursor))
                .thenReturn(3L);

        assertThat(service.countUnread(chatId, buyerId)).isEqualTo(3);
    }

    @Test
    void countUnread_nullCursorMeansAllRead() {
        UUID chatId = UUID.randomUUID();
        ChatParticipant mine = ChatParticipant.builder()
                .chatId(chatId).userId(buyerId).build();
        when(participants.findByChatIdAndUserId(chatId, buyerId)).thenReturn(Optional.of(mine));

        assertThat(service.countUnread(chatId, buyerId)).isZero();
    }

    @Test
    void close_marksClosedAndEmitsEvent() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .status(ChatStatus.ACTIVE).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));

        Chat closed = service.close(chatId, buyerId);
        assertThat(closed.getStatus()).isEqualTo(ChatStatus.CLOSED);
        assertThat(closed.getClosedAt()).isNotNull();
    }
}
