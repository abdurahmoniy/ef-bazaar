package uz.efbazaar.payment.config;

import jakarta.servlet.http.HttpServletRequest;
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
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * STOMP-over-WebSocket transport for live wallet updates.
 *
 * <p>The problem it solves: a deposit lands seconds after the user leaves their
 * banking app, and until now nothing on the page ever asked again — the wallet
 * only moved on a full page reload.
 *
 * <p>Auth model copied from trade-service's {@code /ws/trade}: the handshake
 * goes through the same nginx proxy as REST, so the {@code X-User-Id} headers
 * reach us; a {@link HandshakeInterceptor} captures them and they are
 * re-attached as a Spring Authentication on the CONNECT frame.
 *
 * <p><b>Registered without SockJS</b>, unlike the trade endpoint. The only
 * client is a current browser, raw WebSocket works there, and SockJS's fallback
 * transports each need their own nginx handling and a second npm package on the
 * frontend for no gain.
 */
@Slf4j
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WalletStompAuthInterceptor authInterceptor;

    public WebSocketConfig(WalletStompAuthInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws/payment")
                .setAllowedOriginPatterns("*")
                .addInterceptors(new HeaderCapturingInterceptor());
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authInterceptor);
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
     * Authenticates CONNECT and authorizes SUBSCRIBE.
     *
     * <p>Both halves are load-bearing. A STOMP session is multiplexed across
     * destinations, so CONNECT-time auth alone would let any signed-in user
     * subscribe to {@code /topic/wallet/<somebody else's id>} and watch their
     * deposits arrive. The destination names a user id, so the check is simply
     * that it is their own.
     */
    @Slf4j
    @Component
    static class WalletStompAuthInterceptor implements ChannelInterceptor {

        private static final Pattern WALLET_TOPIC =
                Pattern.compile("^/topic/wallet/([0-9a-fA-F-]{36})$");

        @Override
        public Message<?> preSend(Message<?> message, MessageChannel channel) {
            StompHeaderAccessor acc =
                    MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
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
                acc.setUser(new UsernamePasswordAuthenticationToken(principal, null,
                        roles.stream().map(SimpleGrantedAuthority::new).toList()));
            } catch (IllegalArgumentException e) {
                log.warn("STOMP CONNECT with invalid X-User-Id");
            }
            return message;
        }

        private Message<?> handleSubscribe(Message<?> message, StompHeaderAccessor acc) {
            String destination = acc.getDestination();
            if (destination == null) {
                return message;
            }
            Matcher m = WALLET_TOPIC.matcher(destination);
            if (!m.matches()) {
                // An unrecognised destination is refused rather than ignored.
                // The broker serves exactly one topic shape; anything else is
                // either a typo or somebody probing, and a permissive default
                // here is how a future topic ships without its own check.
                log.warn("SUBSCRIBE to an unknown destination rejected");
                throw new MessagingException("Unknown destination");
            }

            AuthenticatedUser principal = extractPrincipal(acc);
            if (principal == null) {
                log.warn("SUBSCRIBE rejected — no authenticated principal");
                throw new MessagingException("Unauthorized subscribe");
            }
            if (!principal.userId().toString().equalsIgnoreCase(m.group(1))) {
                log.warn("SUBSCRIBE rejected — user {} asked for another user's wallet",
                        principal.userId());
                throw new MessagingException("Not your wallet");
            }
            return message;
        }

        private AuthenticatedUser extractPrincipal(StompHeaderAccessor acc) {
            if (acc.getUser() instanceof UsernamePasswordAuthenticationToken token
                    && token.getPrincipal() instanceof AuthenticatedUser au) {
                return au;
            }
            return null;
        }
    }
}
