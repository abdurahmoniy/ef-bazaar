package uz.efbazaar.marketplace.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import org.junit.jupiter.api.*;
import org.mapstruct.factory.Mappers;
import org.springframework.data.domain.*;
import uz.efbazaar.marketplace.controller.*;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.dto.*;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.repository.*;
import uz.efbazaar.marketplace.security.*;
import uz.efbazaar.marketplace.service.*;
import uz.efbazaar.marketplace.trust.BlacklistGuard;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatSocketCommandsTest {
    private final ChatRepository chats = mock(ChatRepository.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final ChatParticipantRepository participants = mock(ChatParticipantRepository.class);
    private final UUID chatId = UUID.randomUUID();
    private final UUID viewer = UUID.randomUUID();
    private final UUID partner = UUID.randomUUID();
    private final AuthenticatedUser user = new AuthenticatedUser(viewer, null, List.of());
    private final ObjectMapper json = new ObjectMapper();
    private ChatSocketCommands commands;
    @BeforeEach void setup() {
        ChatService service = new ChatService(chats, messages, participants, mock(ListingRepository.class),
                mock(AuthNameClient.class), mock(NotificationService.class), mock(BlacklistGuard.class),
                mock(ChatAccountRequestService.class), mock(AuthSummaryClient.class), mock(TradeLiveClient.class));
        ChatMapper mapper = Mappers.getMapper(ChatMapper.class);
        commands = new ChatSocketCommands(new ChatController(service, mock(ChatAccountRequestService.class), mapper),
                new MessageController(service, mock(ChatAttachmentService.class), mapper, new MessageViewAssembler(service, mapper)),
                service, Validation.buildDefaultValidatorFactory().getValidator());
        when(chats.findById(chatId)).thenReturn(Optional.of(Chat.builder().id(chatId).buyerId(viewer).sellerId(partner).build()));
    }
    @Test void strangerCannotReadSendEditDeleteReadOrHide() {
        AuthenticatedUser stranger = new AuthenticatedUser(UUID.randomUUID(), null, List.of());
        for (String type : List.of("get", "messages", "send", "edit", "delete", "read", "hide", "important", "account-request"))
            assertThatThrownBy(() -> commands.execute(stranger, type, chatId, json.createObjectNode()))
                    .isInstanceOfSatisfying(MarketplaceException.class, e -> assertThat(e.getStatus().value()).isEqualTo(403));
        verifyNoInteractions(messages, participants);
    }
    @Test void participantCannotEditPartnersMessage() throws Exception {
        UUID messageId = UUID.randomUUID();
        when(messages.findById(messageId)).thenReturn(Optional.of(ChatMessage.builder().id(messageId).chatId(chatId).senderId(partner).build()));
        assertThatThrownBy(() -> commands.execute(user, "edit", chatId,
                json.readTree("{\"messageId\":\"" + messageId + "\",\"content\":\"replacement\"}")))
                .isInstanceOfSatisfying(MarketplaceException.class, e -> assertThat(e.getCode()).isEqualTo("not_message_sender"));
        verify(messages, never()).save(any());
    }
    @Test void messagePagePreservesAscendingContentsAndPaginationMetadata() throws Exception {
        var first = ChatMessage.builder().id(UUID.randomUUID()).chatId(chatId).senderId(partner).createdAt(Instant.now()).content("one").build();
        var second = ChatMessage.builder().id(UUID.randomUUID()).chatId(chatId).senderId(viewer).createdAt(Instant.now().plusSeconds(1)).content("two").build();
        var pageable = PageRequest.of(1, 2);
        when(messages.findByChatIdOrderByCreatedAtAsc(chatId, pageable)).thenReturn(new PageImpl<>(List.of(first, second), pageable, 6));
        var response = (PageResponse<?>) commands.execute(user, "messages", chatId, json.readTree("{\"page\":1,\"size\":2}"));
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.totalPages()).isEqualTo(3);
        assertThat(response.totalElements()).isEqualTo(6);
        assertThat(((MessageResponse)response.content().get(0)).content()).isEqualTo("one");
        assertThat(((MessageResponse)response.content().get(1)).content()).isEqualTo("two");
    }
    @Test void invalidBodiesAreRejectedBeforePersistence() throws Exception {
        for (String body : List.of("{\"content\":\"  \"}", "{\"content\":3}"))
            assertThatThrownBy(() -> commands.execute(user, "send", chatId, json.readTree(body))).isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> commands.execute(user, "messages", chatId, json.readTree("{\"size\":10000}"))).isInstanceOf(MarketplaceException.class);
        assertThatThrownBy(() -> commands.execute(user, "read", chatId, json.createObjectNode())).isInstanceOf(MarketplaceException.class);
        verifyNoInteractions(messages, participants);
    }
}
