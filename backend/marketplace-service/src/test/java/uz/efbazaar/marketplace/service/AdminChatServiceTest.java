package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.repository.ChatAccountRequestRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import java.math.BigDecimal;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminChatServiceTest {

    private final ChatRepository chats = mock(ChatRepository.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final AuthSummaryClient users = mock(AuthSummaryClient.class);
    private final MessageViewAssembler views = mock(MessageViewAssembler.class);
    private final ChatAccountRequestRepository requests = mock(ChatAccountRequestRepository.class);
    private final ListingRepository listings = mock(ListingRepository.class);
    private final AdminChatService service = new AdminChatService(chats, messages, users, views, requests, listings);

    private Chat chat() {
        return Chat.builder()
                .id(UUID.randomUUID())
                .listingId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerDisplayName("Ali")
                .sellerDisplayName("Vali")
                .createdAt(Instant.parse("2026-09-16T04:00:00Z"))
                .lastMessageAt(Instant.now())
                .build();
    }

    @Test
    void aSearchIsCaseInsensitiveAndIgnoresTheAtSign() {
        assertThat(AdminChatService.likePattern(" @Ali ")).isEqualTo("%ali%");
        assertThat(AdminChatService.likePattern("@")).isNull();
        assertThat(AdminChatService.likePattern(null)).isNull();
    }

    /** "100%" must find a name containing "100%", not every name starting with "100". */
    @Test
    void wildcardsTypedByTheAdminMatchLiterally() {
        assertThat(AdminChatService.likePattern("a_b%c")).isEqualTo("%a\\_b\\%c%");
    }

    @Test
    void anEmptySearchListsEveryChat() {
        Page<Chat> page = new PageImpl<>(List.of(chat()));
        when(chats.findAllByOrderByLastMessageAtDesc(any())).thenReturn(page);

        assertThat(service.list("  ", 0, 20).content()).hasSize(1);
        verify(chats, never()).searchByName(any(), any());
    }

    @Test
    void theUsernameIsPreferredOverTheNameSnapshot() {
        Chat c = chat();
        when(chats.findAllByOrderByLastMessageAtDesc(any())).thenReturn(new PageImpl<>(List.of(c)));
        when(users.resolveAll(anyCollection())).thenReturn(Map.of(
                c.getBuyerId(), new UserSummary(c.getBuyerId(), "Ali", "ali_uz", 1L, true, Instant.now(), false)));

        var row = service.list(null, 0, 20).content().getFirst();

        assertThat(row.buyerName()).isEqualTo("@ali_uz");
        assertThat(row.sellerName()).as("auth did not know the seller — the snapshot stands in").isEqualTo("Vali");
    }

    @Test
    void messagesComeNewestFirstAndThePageSizeIsCapped() {
        Chat c = chat();
        when(chats.findById(c.getId())).thenReturn(Optional.of(c));
        when(messages.findByChatIdOrderByCreatedAtDescIdDesc(eq(c.getId()), any())).thenReturn(Page.empty());

        service.messages(c.getId(), 0, 10_000);

        verify(messages).findByChatIdOrderByCreatedAtDescIdDesc(c.getId(),
                PageRequest.of(0, AdminChatService.MAX_MESSAGES_PAGE));
    }

    @Test
    void anUnknownChatIsNotFound() {
        UUID id = UUID.randomUUID();
        when(chats.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(UUID.randomUUID(), id)).isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> service.messages(id, 0, 50)).isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> service.listingHistory(id)).isInstanceOf(MarketplaceException.class);
    }

    /** Opening a chat must leave no trace the parties could see — not even a back-filled name. */
    @Test
    void openingAChatWritesNothing() {
        Chat c = chat();
        c.setBuyerDisplayName(null);
        when(chats.findById(c.getId())).thenReturn(Optional.of(c));
        when(messages.findByChatIdOrderByCreatedAtDescIdDesc(eq(c.getId()), any())).thenReturn(Page.empty());

        service.get(UUID.randomUUID(), c.getId());
        service.messages(c.getId(), 0, 50);
        service.listingHistory(c.getId());

        verify(requests, never()).save(any());
        verify(listings, never()).save(any());
        verify(chats, never()).save(any());
        verify(messages, never()).save(any());
    }
    @Test
    void historyUsesEverySelectionAndAnchorsItToThePrecedingMessage() {
        Chat c = chat();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        Instant start = c.getCreatedAt();
        var first = request(c, firstId, start, AccountRequestStatus.CANCELLED);
        var second = request(c, secondId, start.plusSeconds(10), AccountRequestStatus.FULFILLED);
        var third = request(c, firstId, start.plusSeconds(20), AccountRequestStatus.OPEN);
        var beforeSecond = ChatMessage.builder().id(UUID.randomUUID()).build();
        var beforeThird = ChatMessage.builder().id(UUID.randomUUID()).build();
        when(chats.findById(c.getId())).thenReturn(Optional.of(c));
        when(requests.findByChatIdOrderByCreatedAtAscIdAsc(c.getId())).thenReturn(List.of(first, second, third));
        when(messages.findFirstByChatIdAndCreatedAtLessThanEqualOrderByCreatedAtDescIdDesc(c.getId(), second.getCreatedAt()))
                .thenReturn(Optional.of(beforeSecond));
        when(messages.findFirstByChatIdAndCreatedAtLessThanEqualOrderByCreatedAtDescIdDesc(c.getId(), third.getCreatedAt()))
                .thenReturn(Optional.of(beforeThird));
        when(listings.findAllById(any())).thenReturn(List.of(
                Listing.builder().id(firstId).description("First account").price(BigDecimal.valueOf(25000))
                        .status(ListingStatus.SOLD).mediaMessageIds(List.of("cover-1")).build(),
                Listing.builder().id(secondId).description("Second account").price(BigDecimal.valueOf(50000))
                        .status(ListingStatus.DELETED).build()));

        var history = service.listingHistory(c.getId());

        assertThat(history).extracting(e -> e.listingId()).containsExactly(firstId, secondId, firstId);
        assertThat(history).extracting(e -> e.afterMessageId()).containsExactly(null, beforeSecond.getId(), beforeThird.getId());
        assertThat(history).extracting(e -> e.initial()).containsExactly(false, false, false);
        assertThat(history.getFirst().listing().status()).isEqualTo(ListingStatus.SOLD);
        assertThat(history.getFirst().listing().coverMessageId()).isEqualTo("cover-1");
        assertThat(history.get(1).listing().status()).isEqualTo(ListingStatus.DELETED);
        verify(listings).findAllById(List.of(firstId, secondId));
    }

    @Test
    void aChatWithoutSelectionRecordsStillShowsItsOriginalListing() {
        Chat c = chat();
        when(chats.findById(c.getId())).thenReturn(Optional.of(c));
        var history = service.listingHistory(c.getId());
        assertThat(history).hasSize(1);
        assertThat(history.getFirst().listingId()).isEqualTo(c.getListingId());
        assertThat(history.getFirst().createdAt()).isEqualTo(c.getCreatedAt());
        assertThat(history.getFirst().afterMessageId()).isNull();
        assertThat(history.getFirst().initial()).isTrue();
        assertThat(history.getFirst().listing()).as("missing listing retains the historical marker").isNull();
    }

    @Test
    void anOldChatsFirstRecordedSelectionIsNotInventedAsItsOriginalListing() {
        Chat c = chat();
        var selection = request(c, c.getListingId(), c.getCreatedAt().plusSeconds(86400), AccountRequestStatus.OPEN);
        var preceding = ChatMessage.builder().id(UUID.randomUUID()).build();
        when(chats.findById(c.getId())).thenReturn(Optional.of(c));
        when(requests.findByChatIdOrderByCreatedAtAscIdAsc(c.getId())).thenReturn(List.of(selection));
        when(messages.findFirstByChatIdAndCreatedAtLessThanEqualOrderByCreatedAtDescIdDesc(c.getId(), selection.getCreatedAt()))
                .thenReturn(Optional.of(preceding));
        var event = service.listingHistory(c.getId()).getFirst();
        assertThat(event.initial()).isFalse();
        assertThat(event.afterMessageId()).isEqualTo(preceding.getId());

        // No surviving preceding message does not prove the listing opened the chat.
        when(messages.findFirstByChatIdAndCreatedAtLessThanEqualOrderByCreatedAtDescIdDesc(c.getId(), selection.getCreatedAt()))
                .thenReturn(Optional.empty());
        var withoutAnchor = service.listingHistory(c.getId()).getFirst();
        assertThat(withoutAnchor.initial()).isFalse();
        assertThat(withoutAnchor.afterMessageId()).isNull();
    }

    private ChatAccountRequest request(Chat chat, UUID listingId, Instant at, AccountRequestStatus status) {
        return ChatAccountRequest.builder().id(UUID.randomUUID()).chatId(chat.getId())
                .listingId(listingId).requesterId(chat.getBuyerId()).createdAt(at).status(status).build();
    }

}
