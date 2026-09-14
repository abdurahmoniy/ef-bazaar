package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import uz.efbazaar.marketplace.domain.Chat;
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
    private final AdminChatService service = new AdminChatService(chats, messages, users, views);

    private Chat chat() {
        return Chat.builder()
                .id(UUID.randomUUID())
                .listingId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerDisplayName("Ali")
                .sellerDisplayName("Vali")
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
        when(messages.findByChatIdOrderByCreatedAtDesc(eq(c.getId()), any())).thenReturn(Page.empty());

        service.messages(c.getId(), 0, 10_000);

        verify(messages).findByChatIdOrderByCreatedAtDesc(c.getId(),
                PageRequest.of(0, AdminChatService.MAX_MESSAGES_PAGE));
    }

    @Test
    void anUnknownChatIsNotFound() {
        UUID id = UUID.randomUUID();
        when(chats.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(UUID.randomUUID(), id)).isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> service.messages(id, 0, 50)).isInstanceOf(MarketplaceException.class);
    }

    /** Opening a chat must leave no trace the parties could see — not even a back-filled name. */
    @Test
    void openingAChatWritesNothing() {
        Chat c = chat();
        c.setBuyerDisplayName(null);
        when(chats.findById(c.getId())).thenReturn(Optional.of(c));
        when(messages.findByChatIdOrderByCreatedAtDesc(eq(c.getId()), any())).thenReturn(Page.empty());

        service.get(UUID.randomUUID(), c.getId());
        service.messages(c.getId(), 0, 50);

        verify(chats, never()).save(any());
        verify(messages, never()).save(any());
    }
}
