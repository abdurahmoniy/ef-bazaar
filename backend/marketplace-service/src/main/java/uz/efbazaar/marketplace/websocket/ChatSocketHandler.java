package uz.efbazaar.marketplace.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.dto.ChatActivityResponse;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatActivityService;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class ChatSocketHandler extends TextWebSocketHandler {
    private static final int MAX_SESSIONS = 1000;
    private static final int MAX_USER_SESSIONS = 8;
    private static final int MAX_WATCHES = 128;
    private static final int MAX_FRAME_BYTES = 32768;
    private final ObjectMapper json;
    private final ChatSocketCommands commands;
    private final ChatActivityService activity;
    private final ChatRepository chats;
    private final Map<String, Client> clients = new ConcurrentHashMap<>();

    private static final class Watch {
        final UUID partner;
        volatile ChatActivityResponse last;
        Watch(UUID partner, ChatActivityResponse last) { this.partner = partner; this.last = last; }
    }
    private static final class Client {
        final WebSocketSession socket;
        final AuthenticatedUser user;
        final String presenceId = UUID.randomUUID().toString();
        final Map<UUID, Watch> watches = new ConcurrentHashMap<>();
        final long connectedAt = System.currentTimeMillis();
        volatile long lastCommand = System.currentTimeMillis();
        long window = System.currentTimeMillis();
        int commands;
        int subscriptions;
        int frames;
        Client(WebSocketSession socket, AuthenticatedUser user) {
            this.socket = new ConcurrentWebSocketSessionDecorator(socket, 5000, 4 * 1024 * 1024);
            this.user = user;
        }
    }

    @Override
    public synchronized void afterConnectionEstablished(WebSocketSession socket) throws Exception {
        if (!(socket.getPrincipal() instanceof Authentication auth) || !auth.isAuthenticated()
                || !(auth.getPrincipal() instanceof AuthenticatedUser user)) {
            socket.close(CloseStatus.POLICY_VIOLATION);
            return;
        }
        long count = clients.values().stream().filter(c -> c.user.userId().equals(user.userId())).count();
        if (clients.size() >= MAX_SESSIONS || count >= MAX_USER_SESSIONS) {
            socket.close(CloseStatus.POLICY_VIOLATION.withReason("Too many chat connections"));
            return;
        }
        socket.setTextMessageSizeLimit(MAX_FRAME_BYTES);
        socket.setBinaryMessageSizeLimit(1024);
        clients.put(socket.getId(), new Client(socket, user));
    }

    @Override
    protected void handleTextMessage(WebSocketSession socket, TextMessage frame) throws Exception {
        Client client = clients.get(socket.getId());
        if (client == null) { socket.close(CloseStatus.POLICY_VIOLATION); return; }
        if (frame.getPayloadLength() > MAX_FRAME_BYTES) { close(client, CloseStatus.TOO_BIG_TO_PROCESS); return; }
        String id = null;
        synchronized (client) {
            try {
                long now = System.currentTimeMillis();
                client.lastCommand = now;
                if (now - client.window >= 10000) { client.window = now; client.commands = 0; client.subscriptions = 0; client.frames = 0; }
                if (++client.frames > 1200) { close(client, CloseStatus.POLICY_VIOLATION); return; }
                JsonNode request = json.readTree(frame.getPayload());
                if (request == null || !request.isObject()) throw ChatSocketCommands.invalid("Expected a JSON object");
                if (request.path("id").isTextual()) id = request.get("id").textValue();
                if (id == null || id.isBlank() || id.length() > 64) throw ChatSocketCommands.invalid("id is required (maximum 64 characters)");
                if (!request.path("type").isTextual()) throw ChatSocketCommands.invalid("type is required");
                String type = request.get("type").textValue();
                UUID chatId = request.hasNonNull("chatId") ? UUID.fromString(request.get("chatId").asText()) : null;
                boolean subscription = "watch".equals(type) || "unwatch".equals(type);
                boolean cleanup = "unwatch".equals(type) && chatId != null && client.watches.containsKey(chatId);
                if (!cleanup && (subscription ? ++client.subscriptions > 1000 : ++client.commands > 120)) {
                    error(client, id, 429, "Too many chat commands");
                    return;
                }
                JsonNode body = request.path("payload");
                if (!body.isMissingNode() && !body.isNull() && !body.isObject()) throw ChatSocketCommands.invalid("payload must be an object");
                Object result = switch (type) {
                    case "heartbeat" -> { activity.socketPresence(client.user.userId(), client.presenceId,
                            ChatSocketCommands.flag(body, "active")); yield null; }
                    case "watch" -> watch(client, chatId);
                    case "unwatch" -> {
                        if (chatId == null || !client.watches.containsKey(chatId)) commands.requireChat(chatId, client.user.userId());
                        unwatch(client, chatId); yield null;
                    }
                    case "typing" -> { commands.requireChat(chatId, client.user.userId());
                        if (!client.watches.containsKey(chatId)) throw ChatSocketCommands.invalid("Watch the chat before typing");
                        activity.socketTyping(chatId, client.user.userId(), client.presenceId, ChatSocketCommands.flag(body, "typing"));
                        yield null; }
                    default -> commands.execute(client.user, type, chatId, body);
                };
                ObjectNode response = json.createObjectNode().put("id", id).put("type", "result");
                response.set("payload", json.valueToTree(result));
                send(client, response);
            } catch (MarketplaceException e) { error(client, id, e.getStatus().value(), e.getMessage()); }
            catch (IllegalArgumentException | com.fasterxml.jackson.core.JsonProcessingException e) { error(client, id, 400, "Invalid chat command"); }
            catch (DataAccessException e) {
                error(client, id, 503, "Chat temporarily unavailable");
                close(client, CloseStatus.SERVER_ERROR);
            }
            catch (Exception e) { log.warn("Chat socket command failed", e); error(client, id, 500, "Chat command failed"); }
        }
    }

    private ChatActivityResponse watch(Client client, UUID chatId) {
        Chat chat = commands.requireChat(chatId, client.user.userId());
        if (!client.watches.containsKey(chatId) && (client.watches.size() >= MAX_WATCHES
                || clients.values().stream().mapToInt(c -> c.watches.size()).sum() >= 8192))
            throw ChatSocketCommands.invalid("Too many watched chats");
        ChatActivityResponse response = activity.activity(chatId, client.user.userId());
        client.watches.put(chatId, new Watch(chat.partnerOf(client.user.userId()), response));
        return response;
    }

    private void unwatch(Client client, UUID chatId) {
        client.watches.remove(chatId);
        activity.socketTyping(chatId, client.user.userId(), client.presenceId, false);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession socket, CloseStatus status) {
        Client client = clients.remove(socket.getId());
        if (client == null) return;
        try {
            activity.socketPresence(client.user.userId(), client.presenceId, false);
            for (UUID chatId : client.watches.keySet())
                activity.socketTyping(chatId, client.user.userId(), client.presenceId, false);
        } catch (RuntimeException e) { log.debug("Chat disconnect cleanup deferred to Redis TTL", e); }
    }

    @Override
    public void handleTransportError(WebSocketSession socket, Throwable exception) {
        Client client = clients.get(socket.getId());
        if (client != null) close(client, CloseStatus.SERVER_ERROR);
    }

    /** A restored pub/sub subscription may have missed invalidations; reconnect clients for fresh snapshots. */
    public void restartClients() {
        for (Client client : clients.values()) close(client, new CloseStatus(1012, "Chat updates reconnected"));
    }

    /** Runs on Redis listener threads, so every replica can reach its local sockets. */
    public void onSignal(String signal) {
        try {
            if ("resync".equals(signal)) { restartClients(); return; }
            String[] parts = signal.split(":", 2);
            if (parts.length != 2) return;
            UUID id = UUID.fromString(parts[1]);
            if ("changed".equals(parts[0])) {
                Optional<Chat> found = chats.findById(id);
                if (found.isEmpty()) return;
                Chat chat = found.get();
                for (Client client : clients.values()) {
                    if (chat.isParticipant(client.user.userId())) {
                        send(client, json.createObjectNode().put("type", "changed").put("chatId", id.toString()));
                        refresh(client, id);
                    }
                }
            } else if ("activity".equals(parts[0])) {
                refreshEphemeral(id);
            }
        } catch (RuntimeException e) {
            log.warn("Cannot deliver chat signal; reconnecting clients for fresh snapshots", e);
            restartClients();
        }
    }

    /** Redis TTL does not publish expiry by default; compare watched state on a bounded cadence. */
    @Scheduled(fixedDelay = 1000)
    public void expireActivity() {
        long now = System.currentTimeMillis();
        for (Client client : clients.values()) {
            if (now - client.lastCommand > 75000 || now - client.connectedAt > 30 * 60 * 1000L)
                close(client, CloseStatus.SESSION_NOT_RELIABLE);
        }
        refreshEphemeral(null);
    }

    private void refreshEphemeral(UUID partnerId) {
        Map<ChatActivityService.ActivityTarget, List<Map.Entry<Client, Watch>>> targets = new HashMap<>();
        for (Client client : clients.values()) client.watches.forEach((chatId, watch) -> {
            if (partnerId == null || partnerId.equals(watch.partner)) {
                var key = new ChatActivityService.ActivityTarget(chatId, watch.partner, watch.last.lastReadAt());
                targets.computeIfAbsent(key, ignored -> new ArrayList<>()).add(Map.entry(client, watch));
            }
        });
        if (targets.isEmpty()) return;
        try {
            activity.activities(targets.keySet()).forEach((target, value) -> {
                for (var entry : targets.get(target)) update(entry.getKey(), target.chatId(), entry.getValue(), value);
            });
        } catch (RuntimeException e) {
            targets.values().stream().flatMap(Collection::stream).map(Map.Entry::getKey).distinct()
                    .forEach(client -> close(client, CloseStatus.SERVER_ERROR));
        }
    }

    private void refresh(Client client, UUID chatId) {
        Watch watch = client.watches.get(chatId);
        if (watch == null) return;
        try {
            ChatActivityResponse next = activity.activity(chatId, client.user.userId());
            update(client, chatId, watch, next);
        } catch (RuntimeException e) {
            // Disconnect makes the client invalidate stale status and refresh on reconnect.
            close(client, CloseStatus.SERVER_ERROR);
        }
    }

    private void update(Client client, UUID chatId, Watch watch, ChatActivityResponse next) {
        synchronized (watch) {
            // A batch may finish after a committed read update; preserve the newer durable cursor.
            if (watch.last.lastReadAt() != null && (next.lastReadAt() == null || next.lastReadAt().isBefore(watch.last.lastReadAt())))
                next = new ChatActivityResponse(next.online(), next.typing(), next.lastSeenAt(), watch.last.lastReadAt());
            if (Objects.equals(next, watch.last) || client.watches.get(chatId) != watch) return;
            watch.last = next;
            ObjectNode event = json.createObjectNode().put("type", "activity").put("chatId", chatId.toString());
            event.set("payload", json.valueToTree(next));
            send(client, event);
        }
    }

    private void error(Client client, String id, int status, String message) {
        ObjectNode response = json.createObjectNode().put("type", "error").put("status", status).put("message", message);
        if (id != null) response.put("id", id);
        send(client, response);
    }
    private void send(Client client, ObjectNode response) {
        try {
            if (client.socket.isOpen()) client.socket.sendMessage(new TextMessage(json.writeValueAsString(response)));
        } catch (IOException | RuntimeException e) { close(client, CloseStatus.SESSION_NOT_RELIABLE); }
    }
    private void close(Client client, CloseStatus status) {
        try { client.socket.close(status); } catch (IOException ignored) { }
        finally { afterConnectionClosed(client.socket, status); }
    }
}
