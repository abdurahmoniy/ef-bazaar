package uz.efbazaar.marketplace.websocket;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.mapstruct.factory.Mappers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.*;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.controller.*;
import uz.efbazaar.marketplace.domain.*;
import uz.efbazaar.marketplace.mapper.ChatMapper;
import uz.efbazaar.marketplace.repository.*;
import uz.efbazaar.marketplace.security.*;
import uz.efbazaar.marketplace.service.*;
import uz.efbazaar.marketplace.trust.BlacklistGuard;
import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest(classes = ChatSocketTransportIT.App.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"spring.main.banner-mode=off", "spring.data.redis.repositories.enabled=false"})
@Testcontainers(disabledWithoutDocker = true)
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class ChatSocketTransportIT {
    @Container static GenericContainer<?> redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    }
    @SpringBootConfiguration
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class, KafkaAutoConfiguration.class})
    @Import({ChatSocketConfiguration.class, ChatSocketHandler.class, ChatSocketCommands.class, ChatSocketSignals.class,
            ChatMutationNotifications.class, ChatActivityService.class, ChatService.class, ChatController.class,
            MessageController.class, MessageViewAssembler.class, SecurityConfig.class, HeaderAuthenticationFilter.class, InternalSecretFilter.class})
    static class App {
        @Bean ChatMapper mapper() { return Mappers.getMapper(ChatMapper.class); }
    }
    @LocalServerPort int port;
    @Autowired ObjectMapper json;
    @Autowired ChatSocketCommands commands;
    @Autowired ChatActivityService activity;
    @Autowired ChatSocketSignals signals;
    @Autowired org.springframework.data.redis.connection.RedisConnectionFactory redisFactory;
    @Autowired org.springframework.data.redis.listener.RedisMessageListenerContainer chatRedisListener;
    @MockBean ChatRepository chats;
    @MockBean ChatMessageRepository messages;
    @MockBean ChatParticipantRepository participants;
    @MockBean ListingRepository listings;
    @MockBean AuthNameClient authNames;
    @MockBean NotificationService notifications;
    @MockBean BlacklistGuard blacklist;
    @MockBean ChatAccountRequestService requests;
    @MockBean AuthSummaryClient telegram;
    @MockBean TradeLiveClient tradeLive;
    @MockBean ChatAttachmentService attachments;
    private final UUID buyer = UUID.randomUUID();
    private final UUID seller = UUID.randomUUID();
    private final UUID chatId = UUID.randomUUID();
    private final List<WebSocket> sockets = new ArrayList<>();

    class Peer implements WebSocket.Listener {
        final List<JsonNode> frames = new CopyOnWriteArrayList<>();
        final StringBuilder pending = new StringBuilder();
        public void onOpen(WebSocket ws) { ws.request(1); }
        public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            pending.append(data);
            if (last) {
                try { frames.add(json.readTree(pending.toString())); } catch (Exception e) { throw new RuntimeException(e); }
                pending.setLength(0);
            }
            ws.request(1); return CompletableFuture.completedFuture(null);
        }
        JsonNode await(String field, String value) throws Exception {
            long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < end) {
                for (JsonNode frame : frames) if (value.equals(frame.path(field).asText())) return frame;
                Thread.sleep(10);
            }
            throw new AssertionError("No " + field + "=" + value + " in " + frames);
        }
    }
    private WebSocket connect(UUID user, String origin, Peer peer) throws Exception {
        var builder = HttpClient.newHttpClient().newWebSocketBuilder();
        if (user != null) builder.header("X-User-Id", user.toString());
        if (origin != null) builder.header("Origin", origin);
        WebSocket socket = builder.buildAsync(URI.create("ws://localhost:" + port + "/ws/chat"), peer).get(5, TimeUnit.SECONDS);
        sockets.add(socket); return socket;
    }
    private WebSocket connect(UUID user, Peer peer) throws Exception { return connect(user, "http://localhost:" + port, peer); }
    @BeforeEach void setup() {
        when(chats.findById(chatId)).thenReturn(Optional.of(Chat.builder().id(chatId).buyerId(buyer).sellerId(seller).build()));
        when(messages.save(any(ChatMessage.class))).thenAnswer(inv -> {
            ChatMessage message = inv.getArgument(0); message.setId(UUID.randomUUID()); message.setCreatedAt(Instant.now()); return message;
        });
    }
    @AfterEach void cleanup() { sockets.forEach(WebSocket::abort); }

    @Test void trustedAuthenticatedNativeSocketUsesJsonRequestResponseContract() throws Exception {
        when(messages.totalUnreadFor(buyer)).thenReturn(3L);
        Peer peer = new Peer(); WebSocket socket = connect(buyer, peer);
        socket.sendText("{\"id\":\"unread-1\",\"type\":\"unread\"}", true).join();
        JsonNode result = peer.await("id", "unread-1");
        assertThat(result.path("type").asText()).isEqualTo("result");
        assertThat(result.path("payload").path("count").asLong()).isEqualTo(3);
    }
    @Test void handshakeRejectsAnonymousCrossOriginAndMissingOrigin() {
        assertThatThrownBy(() -> connect(null, new Peer())).hasCauseInstanceOf(WebSocketHandshakeException.class);
        assertThatThrownBy(() -> connect(buyer, "https://evil.example", new Peer())).hasCauseInstanceOf(WebSocketHandshakeException.class);
        assertThatThrownBy(() -> connect(buyer, null, new Peer())).hasCauseInstanceOf(WebSocketHandshakeException.class);
    }
    @Test void unauthorizedCommandIsRejectedByRealMembershipGuard() throws Exception {
        Peer stranger = new Peer(); WebSocket socket = connect(UUID.randomUUID(), stranger);
        socket.sendText("{\"id\":\"watch-1\",\"type\":\"watch\",\"chatId\":\"" + chatId + "\"}", true).join();
        assertThat(stranger.await("id", "watch-1").path("status").asInt()).isEqualTo(403);
    }
    @Test void sendNotifiesBothParticipantsThroughRedisButNotStrangers() throws Exception {
        Peer sender = new Peer(); WebSocket socket = connect(buyer, sender);
        Peer receiver = new Peer(); connect(seller, receiver);
        Peer stranger = new Peer(); connect(UUID.randomUUID(), stranger);
        socket.sendText("{\"id\":\"send-1\",\"type\":\"send\",\"chatId\":\"" + chatId + "\",\"payload\":{\"content\":\"hello\"}}", true).join();
        assertThat(sender.await("id", "send-1").path("payload").path("content").asText()).isEqualTo("hello");
        assertThat(sender.await("type", "changed").path("chatId").asText()).isEqualTo(chatId.toString());
        assertThat(receiver.await("type", "changed").path("chatId").asText()).isEqualTo(chatId.toString());
        assertThat(stranger.frames).isEmpty();
    }
    @Test void httpMessageMutationAlsoReachesSocketParticipants() throws Exception {
        Peer receiver = new Peer(); connect(seller, receiver);
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/chats/" + chatId + "/messages"))
                .header("X-User-Id", buyer.toString()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"content\":\"from HTTP\"}")).build();
        assertThat(HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(201);
        assertThat(receiver.await("type", "changed").path("chatId").asText()).isEqualTo(chatId.toString());
    }

    @Test void redisPublicationReachesAnotherReplicaHandler() throws Exception {
        var other = new ChatSocketHandler(json, commands, activity, chats);
        var remote = mock(org.springframework.web.socket.WebSocketSession.class);
        when(remote.getId()).thenReturn("other-replica"); when(remote.isOpen()).thenReturn(true);
        when(remote.getPrincipal()).thenReturn(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(seller, null, List.of()), null, List.of()));
        List<String> events = new CopyOnWriteArrayList<>();
        doAnswer(inv -> { events.add(((org.springframework.web.socket.TextMessage) inv.getArgument(0)).getPayload()); return null; })
                .when(remote).sendMessage(any());
        var listener = new org.springframework.data.redis.listener.RedisMessageListenerContainer();
        listener.setConnectionFactory(redisFactory);
        listener.addMessageListener((message, pattern) -> other.onSignal(new String(message.getBody(), java.nio.charset.StandardCharsets.UTF_8)),
                new org.springframework.data.redis.listener.ChannelTopic(ChatSocketSignals.CHANNEL));
        listener.afterPropertiesSet(); listener.start();
        try {
            other.afterConnectionEstablished(remote);
            Peer local = new Peer(); connect(buyer, local);
            signals.changed(chatId);
            local.await("type", "changed");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (events.isEmpty() && System.nanoTime() < deadline) Thread.sleep(10);
            assertThat(events).anyMatch(event -> event.contains("changed") && event.contains(chatId.toString()));
        } finally {
            other.afterConnectionClosed(remote, org.springframework.web.socket.CloseStatus.NORMAL);
            listener.stop(); listener.destroy();
        }
    }
    @Test void watchedPartnerReceivesPresenceChangesWithoutPolling() throws Exception {
        Peer viewer = new Peer(); WebSocket first = connect(buyer, viewer);
        first.sendText("{\"id\":\"watch\",\"type\":\"watch\",\"chatId\":\"" + chatId + "\"}", true).join();
        viewer.await("id", "watch");
        Peer partner = new Peer(); WebSocket second = connect(seller, partner);
        second.sendText("{\"id\":\"beat\",\"type\":\"heartbeat\",\"payload\":{\"active\":true}}", true).join();
        partner.await("id", "beat");
        assertThat(viewer.await("type", "activity").path("payload").path("online").asBoolean()).isTrue();
    }
    @Test void httpAttachmentMutationNotifiesTheConnectedPartner() throws Exception {
        when(attachments.upload(any(), eq(false))).thenReturn(new ChatAttachmentService.Uploaded(AttachmentType.FILE, "telegram-id", "proof.txt", "text/plain", 5));
        Peer receiver = new Peer(); connect(seller, receiver);
        String boundary = "chat-test-boundary";
        String body = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"proof.txt\"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--" + boundary + "--\r\n";
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/chats/" + chatId + "/messages/attachments"))
                .header("X-User-Id", buyer.toString()).header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        assertThat(HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(201);
        receiver.await("type", "changed");
    }
}
