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
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.math.BigDecimal;
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
    @Mock ListingRepository listings;
    @Mock MarketplaceEventPublisher events;

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
