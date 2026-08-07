package uz.efbazaar.trade.config;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.HandshakeInterceptor;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.domain.TradeViewer;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthInterceptor stompAuthInterceptor;

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
        registration.interceptors(stompAuthInterceptor);
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

    /**
     * Authenticates CONNECT frames from nginx-injected headers, and authorizes
     * SUBSCRIBE frames against trade participation — a STOMP session is
     * multiplexed across many destinations, so CONNECT-time auth alone would
     * let any authenticated user SUBSCRIBE to any trade's topic.
     */
    @Slf4j
    @Component
    @RequiredArgsConstructor
    static class StompAuthInterceptor implements ChannelInterceptor {

        private static final Pattern TRADE_TOPIC =
                Pattern.compile("^/topic/trades/([0-9a-fA-F-]{36})/(seller|buyer)$");

        private final TradeRepository trades;

        @Override
        public Message<?> preSend(Message<?> message, MessageChannel channel) {
            StompHeaderAccessor acc = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
            if (acc == null) {
                return message;
            }
            if (acc.getCommand() == StompCommand.CONNECT) {
                return handleConnect(message, acc);
            }
            if (acc.getCommand() == StompCommand.SUBSCRIBE) {
                return handleSubscribe(message, acc);
            }
            return message;
        }

        private Message<?> handleConnect(Message<?> message, StompHeaderAccessor acc) {
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

        private Message<?> handleSubscribe(Message<?> message, StompHeaderAccessor acc) {
            String destination = acc.getDestination();
            if (destination == null) {
                return message;
            }
            Matcher m = TRADE_TOPIC.matcher(destination);
            if (!m.matches()) {
                // Not a per-trade topic — nothing for us to authorize here.
                return message;
            }

            AuthenticatedUser principal = extractPrincipal(acc);
            if (principal == null) {
                log.warn("SUBSCRIBE to {} rejected — no authenticated principal", destination);
                throw new MessagingException("Unauthorized subscribe");
            }

            UUID tradeId;
            try {
                tradeId = UUID.fromString(m.group(1));
            } catch (IllegalArgumentException e) {
                throw new MessagingException("Invalid trade id in destination");
            }
            String subscribedRole = m.group(2);

            var trade = trades.findByIdAndViewer(tradeId, principal.userId())
                    .orElseThrow(() -> {
                        log.warn("SUBSCRIBE to {} rejected — user {} may not view this trade",
                                destination, principal.userId());
                        return new MessagingException("Not a viewer of this trade");
                    });

            TradeViewer viewer = trade.viewerFor(principal.userId());
            // The assigned admin legitimately follows BOTH party chats — that is
            // the whole shape of a human trade, not a leak. But only once they
            // have accepted (spec §6.1): live push is a chat read, so an admin
            // still deciding on the invitation is refused here for the same
            // reason TradeChatService refuses their REST read.
            if (viewer == TradeViewer.ADMIN) {
                if (!trade.isAdminAccepted()) {
                    log.warn("SUBSCRIBE to {} rejected — admin {} has not accepted the invitation yet",
                            destination, principal.userId());
                    throw new MessagingException("Admin has not accepted this trade yet");
                }
                return message;
            }

            boolean roleMatches =
                    (viewer == TradeViewer.SELLER && "seller".equals(subscribedRole))
                 || (viewer == TradeViewer.BUYER  && "buyer".equals(subscribedRole));
            if (!roleMatches) {
                log.warn("SUBSCRIBE to {} rejected — user {} is {} but asked for {}",
                        destination, principal.userId(), viewer, subscribedRole);
                throw new MessagingException("Subscribed role does not match caller's role in trade");
            }

            return message;
        }

        private AuthenticatedUser extractPrincipal(StompHeaderAccessor acc) {
            var user = acc.getUser();
            if (user instanceof UsernamePasswordAuthenticationToken token
                    && token.getPrincipal() instanceof AuthenticatedUser au) {
                return au;
            }
            return null;
        }
    }
}
