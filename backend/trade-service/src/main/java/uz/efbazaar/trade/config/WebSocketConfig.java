package uz.efbazaar.trade.config;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.HandshakeInterceptor;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * STOMP-over-WebSocket transport for live trade updates.
 *
 * <p>Auth model: the WSS handshake goes through the same nginx proxy as REST,
 * so the {@code X-User-Id} etc. headers reach us. We capture them in a
 * {@link HandshakeInterceptor} and re-attach as a Spring Authentication on
 * the CONNECT frame.
 */
@Slf4j
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/trade")
                .setAllowedOriginPatterns("*")
                .addInterceptors(new HeaderCapturingInterceptor())
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new StompAuthInterceptor());
    }

    private static class HeaderCapturingInterceptor implements HandshakeInterceptor {
        @Override
        public boolean beforeHandshake(ServerHttpRequest request,
                                       ServerHttpResponse response,
                                       WebSocketHandler wsHandler,
                                       Map<String, Object> attributes) {
            if (request instanceof ServletServerHttpRequest s) {
                HttpServletRequest r = s.getServletRequest();
                attributes.put("X-User-Id", r.getHeader("X-User-Id"));
                attributes.put("X-User-Roles", r.getHeader("X-User-Roles"));
            }
            return true;
        }
        @Override
        public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Exception exception) {
            // no-op
        }
    }

    private static class StompAuthInterceptor implements ChannelInterceptor {
        @Override
        public Message<?> preSend(Message<?> message, MessageChannel channel) {
            StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
            if (acc == null || acc.getCommand() != StompCommand.CONNECT) {
                return message;
            }
            Map<String, Object> attrs = acc.getSessionAttributes();
            if (attrs == null) return message;
            Object idStr = attrs.get("X-User-Id");
            if (idStr == null) return message;
            try {
                UUID userId = UUID.fromString(idStr.toString());
                List<String> roles = attrs.get("X-User-Roles") == null
                        ? Collections.emptyList()
                        : Arrays.stream(attrs.get("X-User-Roles").toString().split(","))
                            .map(String::trim).filter(s -> !s.isEmpty()).toList();
                AuthenticatedUser principal = new AuthenticatedUser(userId, null, roles, null);
                var auth = new UsernamePasswordAuthenticationToken(principal, null,
                        roles.stream().map(SimpleGrantedAuthority::new).toList());
                acc.setUser(auth);
            } catch (IllegalArgumentException e) {
                log.warn("STOMP CONNECT with invalid X-User-Id: {}", idStr);
            }
            return message;
        }
    }
}
