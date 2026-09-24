package uz.efbazaar.marketplace.websocket;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.server.HandshakeInterceptor;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.List;

@Configuration
@EnableWebSocket
public class ChatSocketConfiguration implements WebSocketConfigurer {
    private final ChatSocketHandler handler;
    private final List<String> allowedOrigins;

    public ChatSocketConfiguration(ChatSocketHandler handler,
            @Value("${chat.websocket.allowed-origins:${CHAT_WEBSOCKET_ALLOWED_ORIGINS:}}") String origins) {
        this.handler = handler;
        this.allowedOrigins = origins == null || origins.isBlank() ? List.of()
                : java.util.Arrays.stream(origins.split(",")).map(String::trim).peek(origin -> {
                    URI uri = URI.create(origin);
                    if (!validOrigin(uri) || origin.contains("*"))
                        throw new IllegalArgumentException("Chat WebSocket origins must be literal http(s) origins");
                }).toList();
    }

    private static boolean validOrigin(URI uri) {
        return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme()))
                && uri.getHost() != null && uri.getUserInfo() == null && uri.getQuery() == null
                && uri.getFragment() == null && (uri.getPath() == null || uri.getPath().isEmpty());
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // Empty allowed-origins list uses Spring's same-origin policy; the interceptor also rejects absent Origin.
        registry.addHandler(handler, "/ws/chat").addInterceptors(new SameOriginAuthenticatedHandshake(allowedOrigins))
                .setAllowedOrigins(allowedOrigins.toArray(String[]::new));
    }

    @Bean
    RedisMessageListenerContainer chatRedisListener(RedisConnectionFactory factory) {
        RedisMessageListenerContainer listener = new RedisMessageListenerContainer();
        listener.setConnectionFactory(factory);
        listener.addMessageListener(new ChatSubscription(handler), new ChannelTopic(ChatSocketSignals.CHANNEL));
        listener.setErrorHandler(error -> handler.restartClients());
        return listener;
    }

    static final class ChatSubscription implements org.springframework.data.redis.connection.MessageListener,
            org.springframework.data.redis.connection.SubscriptionListener {
        private final ChatSocketHandler handler;
        ChatSubscription(ChatSocketHandler handler) { this.handler = handler; }
        @Override public void onMessage(org.springframework.data.redis.connection.Message message, byte[] pattern) {
            handler.onSignal(new String(message.getBody(), StandardCharsets.UTF_8));
        }
        @Override public void onChannelSubscribed(byte[] channel, long count) { handler.restartClients(); }
    }

    static final class SameOriginAuthenticatedHandshake implements HandshakeInterceptor {
        private final List<String> allowedOrigins;
        SameOriginAuthenticatedHandshake(List<String> allowedOrigins) { this.allowedOrigins = allowedOrigins; }
        @Override
        public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                       WebSocketHandler handler, Map<String, Object> attributes) {
            if (!(request.getPrincipal() instanceof Authentication auth) || !auth.isAuthenticated()
                    || !(auth.getPrincipal() instanceof AuthenticatedUser)) {
                response.setStatusCode(HttpStatus.UNAUTHORIZED);
                return false;
            }
            String origin = request.getHeaders().getOrigin();
            try {
                URI source = origin == null ? null : URI.create(origin);
                URI target = request.getURI();
                boolean sameOrigin = source != null && validOrigin(source)
                        && source.getHost().equalsIgnoreCase(target.getHost())
                        && source.getScheme().equalsIgnoreCase(target.getScheme()) && port(source) == port(target);
                if (source == null || !validOrigin(source) || (!sameOrigin && !allowedOrigins.contains(origin))) {
                    response.setStatusCode(HttpStatus.FORBIDDEN);
                    return false;
                }
                return true;
            } catch (IllegalArgumentException e) {
                response.setStatusCode(HttpStatus.FORBIDDEN);
                return false;
            }
        }
        private static int port(URI uri) { return uri.getPort() >= 0 ? uri.getPort() : "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80; }
        @Override public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                             WebSocketHandler handler, Exception exception) { }
    }
}
