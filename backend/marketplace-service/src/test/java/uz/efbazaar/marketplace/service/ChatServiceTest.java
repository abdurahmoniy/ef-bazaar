package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthNameClient;

import java.math.BigDecimal;
import java.util.Map;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock ChatRepository chats;
    @Mock ChatMessageRepository messages;
    @Mock ChatParticipantRepository participants;
    @Mock ListingRepository listings;
    @Mock AuthNameClient authNameClient;
    @Mock NotificationService notifications;

    @Mock uz.efbazaar.marketplace.trust.BlacklistGuard blacklistGuard;
    @Mock ChatAccountRequestService accountRequests;
    @Mock uz.efbazaar.marketplace.security.AuthSummaryClient telegramUsers;
    @Mock TradeLiveClient tradeLive;
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
        when(chats.findBetween(buyerId, sellerId))
                .thenReturn(java.util.List.of());
        when(chats.save(any(Chat.class))).thenAnswer(inv -> {
            Chat c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        Chat chat = service.start(buyerId, listingId);
        assertThat(chat.getBuyerId()).isEqualTo(buyerId);
        assertThat(chat.getSellerId()).isEqualTo(sellerId);
        assertThat(chat.isImportant()).isFalse();
    }

    @Test
    void start_snapshotsBuyerAndSellerDisplayNames() {
        when(listings.findById(listingId)).thenReturn(Optional.of(activeListing));
        when(chats.findBetween(buyerId, sellerId))
                .thenReturn(java.util.List.of());
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
        when(chats.findBetween(buyerId, sellerId))
                .thenReturn(java.util.List.of());
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
                .build();
        when(listings.findById(listingId)).thenReturn(Optional.of(activeListing));
        when(chats.findBetween(buyerId, sellerId))
                .thenReturn(java.util.List.of(existing));

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
                .build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));

        assertThatThrownBy(() -> service.sendMessage(chatId, stranger, "hi"))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("ishtirok");
    }

    @Test
    void toggleImportant_togglesMyRowAndRecomputesAggregate() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .important(false).build();
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

    /**
     * O'chirish suhbatni IKKALA taraf uchun ham nolga qaytaradi.
     *
     * <p>Ilgari faqat yashirar edi: keyingi xabar bayroqni tozalab, butun
     * eski tarixni qaytarardi. Juftlik boshqa akkount ustida yangi suhbat
     * boshlaganda eskisi, jumladan tugagan savdolar statuslari, ko'rinib
     * turardi.
     */
    @Test
    void clearHistory_resetsTheConversationForBothSides() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .build();
        ChatParticipant mine = ChatParticipant.builder().chatId(chatId).userId(buyerId).build();
        ChatParticipant partner = ChatParticipant.builder().chatId(chatId).userId(sellerId).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        when(participants.findByChatId(chatId)).thenReturn(List.of(mine, partner));
        when(tradeLive.hasLiveTrade(chatId)).thenReturn(false);

        service.clearHistory(chatId, buyerId);

        assertThat(chat.getClearedAt()).isNotNull();
        assertThat(mine.getHiddenAt()).isNotNull();
        assertThat(partner.getHiddenAt()).isNotNull();
    }

    @Test
    void clearHistory_isRefusedWhileATradeIsRunning() {
        // Savdo paneli baribir trade-service'dan keladi, lekin kelishuv
        // yozishmasining yo'qolishi nizoni hal qilib bo'lmas holga keltiradi.
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        when(tradeLive.hasLiveTrade(chatId)).thenReturn(true);

        assertThatThrownBy(() -> service.clearHistory(chatId, buyerId))
                .isInstanceOf(uz.efbazaar.marketplace.exception.MarketplaceException.class);

        assertThat(chat.getClearedAt()).isNull();
    }

    @Test
    void listMessages_hidesWhatWasClearedButKeepsTheRest() {
        // Xabarlar o'chirilmaydi — faqat ko'rsatilmaydi. Admin panelida
        // nizo uchun ochib ko'rish mumkin bo'lishi kerak.
        UUID chatId = UUID.randomUUID();
        Instant clearedAt = Instant.now().minusSeconds(60);
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .clearedAt(clearedAt)
                .build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        var pageable = org.springframework.data.domain.PageRequest.of(0, 20);
        when(messages.findByChatIdAndCreatedAtAfterOrderByCreatedAtAsc(chatId, clearedAt, pageable))
                .thenReturn(org.springframework.data.domain.Page.empty());

        service.listMessages(chatId, buyerId, pageable);

        verify(messages).findByChatIdAndCreatedAtAfterOrderByCreatedAtAsc(chatId, clearedAt, pageable);
        verify(messages, never()).findByChatIdOrderByCreatedAtAsc(any(), any());
    }

    @Test
    void sendMessage_unhidesChatForEveryone() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .build();
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

    private UUID savingChat() {
        UUID chatId = UUID.randomUUID();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId)
                .build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        when(messages.save(any(ChatMessage.class))).thenAnswer(inv -> {
            ChatMessage m = inv.getArgument(0);
            m.setId(UUID.randomUUID());
            m.setCreatedAt(java.time.Instant.now());
            return m;
        });
        return chatId;
    }

    @Test
    void sendMessage_hidesContactAndFlagsTheMessage() {
        // Xaridor sotuvchini garovsiz savdoga olib ketmasin: kontakt hech
        // qachon bazaga ham, ikkinchi tomonga ham yetib bormaydi.
        UUID chatId = savingChat();

        ChatMessage sent = service.sendMessage(chatId, buyerId, "telegramdan yozing @seller_uz");

        assertThat(sent.getContent()).isEqualTo("telegramdan yozing " + uz.efbazaar.marketplace.chat.ContactShield.PLACEHOLDER);
        assertThat(sent.isContactHidden()).isTrue();
    }

    @Test
    void sendMessage_leavesOrdinaryTextUnflagged() {
        UUID chatId = savingChat();

        ChatMessage sent = service.sendMessage(chatId, buyerId, "Konami ID ASJE-112-079-938, narxi 150 000");

        assertThat(sent.getContent()).isEqualTo("Konami ID ASJE-112-079-938, narxi 150 000");
        assertThat(sent.isContactHidden()).isFalse();
    }

    @Test
    void sendAttachment_hidesContactInCaption() {
        UUID chatId = savingChat();
        var uploaded = new ChatAttachmentService.Uploaded(
                uz.efbazaar.marketplace.domain.AttachmentType.IMAGE, "file-1", "a.jpg", "image/jpeg", 10L);

        ChatMessage sent = service.sendAttachment(chatId, sellerId, uploaded, "+998 90 123 45 67");

        assertThat(sent.getContent()).isEqualTo(uz.efbazaar.marketplace.chat.ContactShield.PLACEHOLDER);
        assertThat(sent.isContactHidden()).isTrue();
    }

    @Test
    void editMessage_cannotSmuggleAContactIn() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        ChatMessage own = ChatMessage.builder()
                .id(messageId).chatId(chatId).senderId(buyerId).content("salom").build();
        Chat chat = Chat.builder()
                .id(chatId).listingId(listingId).buyerId(buyerId).sellerId(sellerId).build();
        when(chats.findById(chatId)).thenReturn(Optional.of(chat));
        when(messages.findById(messageId)).thenReturn(Optional.of(own));

        ChatMessage edited = service.editMessage(chatId, messageId, buyerId, "t.me/seller_uz");

        assertThat(edited.getContent()).isEqualTo(uz.efbazaar.marketplace.chat.ContactShield.PLACEHOLDER);
        assertThat(edited.isContactHidden()).isTrue();
    }

    @Test
    void stampOwnName_setsCallersSideAndOverwritesOnRename() {
        Chat chat = Chat.builder()
                .id(UUID.randomUUID()).listingId(listingId)
                .buyerId(buyerId).sellerId(sellerId)
                .sellerDisplayName("Eski Ism")
                .build();

        service.stampOwnName(java.util.List.of(chat), buyerId, "Aziz Rahmatov");
        assertThat(chat.getBuyerDisplayName()).isEqualTo("Aziz Rahmatov");
        assertThat(chat.getSellerDisplayName()).isEqualTo("Eski Ism"); // partner untouched

        service.stampOwnName(java.util.List.of(chat), sellerId, "Yangi Ism");
        assertThat(chat.getSellerDisplayName()).isEqualTo("Yangi Ism"); // rename propagates

        service.stampOwnName(java.util.List.of(chat), buyerId, null);
        assertThat(chat.getBuyerDisplayName()).isEqualTo("Aziz Rahmatov"); // null name = no-op
    }

    @Test
    void markRead_legacyCursorUsesAtomicAdvance() {
        UUID chatId = UUID.randomUUID();
        when(chats.findById(chatId)).thenReturn(Optional.of(Chat.builder()
                .id(chatId).buyerId(buyerId).sellerId(sellerId).build()));
        Instant before = Instant.now();
        service.markRead(chatId, buyerId);
        var timestamp = org.mockito.ArgumentCaptor.forClass(Instant.class);
        verify(participants).advanceReadCursor(org.mockito.ArgumentMatchers.eq(chatId),
                org.mockito.ArgumentMatchers.eq(buyerId), timestamp.capture());
        assertThat(timestamp.getValue()).isBetween(before, Instant.now());
    }

    @Test
    void markRead_advancesOnlyThroughTheProvidedMessage() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        Instant sent = Instant.now().minusSeconds(30);
        when(chats.findById(chatId)).thenReturn(Optional.of(Chat.builder()
                .id(chatId).buyerId(buyerId).sellerId(sellerId).build()));
        when(messages.findById(messageId)).thenReturn(Optional.of(ChatMessage.builder()
                .id(messageId).chatId(chatId).senderId(sellerId).createdAt(sent).build()));
        service.markRead(chatId, buyerId, messageId);
        verify(participants).advanceReadCursor(chatId, buyerId, sent);
    }

    @Test
    void markRead_rejectsCrossChatMessagesBeforeUpdatingCursor() {
        UUID chatId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();
        when(chats.findById(chatId)).thenReturn(Optional.of(Chat.builder()
                .id(chatId).buyerId(buyerId).sellerId(sellerId).build()));
        when(messages.findById(messageId)).thenReturn(Optional.of(ChatMessage.builder()
                .id(messageId).chatId(UUID.randomUUID()).createdAt(Instant.now()).build()));
        assertThatThrownBy(() -> service.markRead(chatId, buyerId, messageId))
                .isInstanceOfSatisfying(MarketplaceException.class,
                        ex -> assertThat(ex.getCode()).isEqualTo("message_not_found"));
        org.mockito.Mockito.verifyNoInteractions(participants);
    }

    @Test
    void markRead_rejectsStrangersBeforeReadingMessage() {
        UUID chatId = UUID.randomUUID();
        when(chats.findById(chatId)).thenReturn(Optional.of(Chat.builder()
                .id(chatId).buyerId(buyerId).sellerId(sellerId).build()));
        assertThatThrownBy(() -> service.markRead(chatId, UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(MarketplaceException.class);
        org.mockito.Mockito.verifyNoInteractions(participants, messages);
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
    void requiresTelegramBeforeAnySideEffects() {
        org.mockito.Mockito.doThrow(new MarketplaceException(
                org.springframework.http.HttpStatus.FORBIDDEN, "telegram_required", "Telegramni ulang"))
                .when(telegramUsers).requireTelegramLinked(buyerId);
        assertThatThrownBy(() -> service.start(buyerId, listingId))
                .isInstanceOfSatisfying(MarketplaceException.class,
                        ex -> assertThat(ex.getCode()).isEqualTo("telegram_required"));
        org.mockito.Mockito.verifyNoInteractions(chats, accountRequests, participants);
    }
}
