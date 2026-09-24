package uz.efbazaar.marketplace.websocket;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.socket.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatActivityService;
import uz.efbazaar.marketplace.repository.ChatRepository;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ChatSocketHandlerTest {
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final ChatSocketCommands commands = mock(ChatSocketCommands.class);
    private final ChatActivityService activity = mock(ChatActivityService.class);
    private final ChatRepository chats = mock(ChatRepository.class);
    private ChatSocketHandler handler;
    private final UUID userId = UUID.randomUUID();
    private final AuthenticatedUser user = new AuthenticatedUser(userId, null, List.of());
    private WebSocketSession session;
    private final List<JsonNode> sent = new ArrayList<>();

    @BeforeEach void setup() throws Exception {
        handler = new ChatSocketHandler(json, commands, activity, chats);
        session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("socket-1");
        when(session.isOpen()).thenReturn(true);
        when(session.getPrincipal()).thenReturn(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        doAnswer(i -> { sent.add(json.readTree(((TextMessage)i.getArgument(0)).getPayload())); return null; })
                .when(session).sendMessage(any());
        handler.afterConnectionEstablished(session);
    }
    @Test void resultsRetainRequestIdAndPayload() throws Exception {
        when(commands.execute(eq(user), eq("unread"), isNull(), any())).thenReturn(Map.of("count", 3));
        handler.handleTextMessage(session, new TextMessage("{\"id\":\"one\",\"type\":\"unread\"}"));
        assertThat(sent.get(0).get("id").asText()).isEqualTo("one");
        assertThat(sent.get(0).get("type").asText()).isEqualTo("result");
        assertThat(sent.get(0).get("payload").get("count").asInt()).isEqualTo(3);
    }
    @Test void unauthenticatedSessionsAreRejected() throws Exception {
        var anonymous = mock(WebSocketSession.class);
        handler.afterConnectionEstablished(anonymous);
        verify(anonymous).close(CloseStatus.POLICY_VIOLATION);
    }
    @Test void malformedCommandsCannotReachServices() throws Exception {
        handler.handleTextMessage(session, new TextMessage("{\"id\":\"x\"}"));
        assertThat(sent.get(0).get("type").asText()).isEqualTo("error");
        assertThat(sent.get(0).get("status").asInt()).isEqualTo(400);
        verifyNoInteractions(commands);
    }
    @Test void domainAuthorizationFailureIsARequestError() throws Exception {
        when(commands.execute(eq(user), eq("get"), any(), any())).thenThrow(
                uz.efbazaar.marketplace.exception.MarketplaceException.notChatParticipant());
        handler.handleTextMessage(session, new TextMessage("{\"id\":\"x\",\"type\":\"get\",\"chatId\":\"" + UUID.randomUUID() + "\"}"));
        assertThat(sent.get(0).get("status").asInt()).isEqualTo(403);
    }
    @Test void disconnectRemovesOnlyItsSessionPresence() throws Exception {
        handler.afterConnectionClosed(session, CloseStatus.NORMAL);
        verify(activity).socketPresence(eq(userId), anyString(), eq(false));
    }
    @Test void heartbeatInfrastructureFailureClosesEvenWithoutAnyWatchedChat() throws Exception {
        doThrow(new org.springframework.data.redis.RedisConnectionFailureException("down"))
                .when(activity).socketPresence(eq(userId), anyString(), eq(true));
        handler.handleTextMessage(session, new TextMessage("{\"id\":\"beat\",\"type\":\"heartbeat\",\"payload\":{\"active\":true}}"));
        assertThat(sent.get(0).path("status").asInt()).isEqualTo(503);
        verify(session).close(CloseStatus.SERVER_ERROR);
    }
    @Test void resubscribedRedisChannelForcesFreshSnapshots() throws Exception {
        new ChatSocketConfiguration.ChatSubscription(handler).onChannelSubscribed(new byte[0], 1);
        verify(session).close(argThat(status -> status.getCode() == 1012));
    }
    @Test void oversizedFrameClosesTheSocketWithoutCallingServices() throws Exception {
        handler.handleTextMessage(session, new TextMessage("x".repeat(32769)));
        verify(session).close(CloseStatus.TOO_BIG_TO_PROCESS);
        verifyNoInteractions(commands);
    }
    @Test void failedInvalidationReadClosesUnwatchedSocketsForSnapshotRecovery() throws Exception {
        UUID chat = UUID.randomUUID();
        when(chats.findById(chat)).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("down"));
        handler.onSignal("changed:" + chat);
        verify(session).close(argThat(status -> status.getCode() == 1012));
    }
}
