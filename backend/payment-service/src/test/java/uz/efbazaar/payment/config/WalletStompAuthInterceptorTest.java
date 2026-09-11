package uz.efbazaar.payment.config;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The wallet socket's access control.
 *
 * <p>This is the file that decides whether one signed-in user can watch
 * another's deposits arrive. A STOMP session is multiplexed across
 * destinations, so authenticating the CONNECT frame proves who is asking and
 * nothing more — the SUBSCRIBE check is what ties a destination to its owner.
 */
class WalletStompAuthInterceptorTest {

    private final WebSocketConfig.WalletStompAuthInterceptor interceptor =
            new WebSocketConfig.WalletStompAuthInterceptor();

    private static Message<byte[]> connect(String userId, String roles) {
        StompHeaderAccessor acc = StompHeaderAccessor.create(StompCommand.CONNECT);
        Map<String, Object> attrs = new HashMap<>();
        attrs.put("X-User-Id", userId);
        attrs.put("X-User-Roles", roles);
        acc.setSessionAttributes(attrs);
        // Spring's inbound channel hands the interceptor a MUTABLE accessor —
        // that is the whole mechanism by which setUser() on CONNECT sticks.
        // Without this the headers freeze on createMessage and the interceptor
        // throws "Already immutable" against a message the real broker would
        // have accepted.
        acc.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], acc.getMessageHeaders());
    }

    private static StompHeaderAccessor subscribeAccessor(String destination, UUID asUser) {
        StompHeaderAccessor acc = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        acc.setLeaveMutable(true);
        acc.setDestination(destination);
        if (asUser != null) {
            AuthenticatedUser principal = new AuthenticatedUser(asUser, null, java.util.List.of(), null);
            acc.setUser(new UsernamePasswordAuthenticationToken(principal, null, java.util.List.of()));
        }
        return acc;
    }

    private Message<?> subscribe(String destination, UUID asUser) {
        StompHeaderAccessor acc = subscribeAccessor(destination, asUser);
        return interceptor.preSend(
                MessageBuilder.createMessage(new byte[0], acc.getMessageHeaders()), null);
    }

    private static AuthenticatedUser principalOf(Message<?> message) {
        StompHeaderAccessor acc = StompHeaderAccessor.wrap(message);
        if (acc.getUser() instanceof UsernamePasswordAuthenticationToken token
                && token.getPrincipal() instanceof AuthenticatedUser au) {
            return au;
        }
        return null;
    }

    @Test
    void connectAdoptsTheIdentityNginxVerified() {
        UUID user = UUID.randomUUID();

        Message<?> out = interceptor.preSend(connect(user.toString(), "ROLE_USER"), null);

        AuthenticatedUser principal = principalOf(out);
        assertThat(principal).isNotNull();
        assertThat(principal.userId()).isEqualTo(user);
        assertThat(principal.roles()).containsExactly("ROLE_USER");
    }

    /**
     * nginx refuses an unauthenticated handshake, so this should be
     * unreachable. It still must not throw: an exception on the inbound
     * channel takes the whole session down rather than the one frame.
     */
    @Test
    void connectWithoutHeadersLeavesTheSessionAnonymous() {
        StompHeaderAccessor acc = StompHeaderAccessor.create(StompCommand.CONNECT);
        acc.setLeaveMutable(true);
        acc.setSessionAttributes(new HashMap<>());
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], acc.getMessageHeaders());

        Message<?> out = interceptor.preSend(message, null);

        assertThat(principalOf(out)).isNull();
    }

    @Test
    void connectWithAMalformedUserIdIsNotFatal() {
        Message<?> out = interceptor.preSend(connect("not-a-uuid", "ROLE_USER"), null);

        assertThat(principalOf(out)).isNull();
    }

    @Test
    void aUserMaySubscribeToTheirOwnWallet() {
        UUID user = UUID.randomUUID();

        assertThat(subscribe("/topic/wallet/" + user, user)).isNotNull();
    }

    /** The one that matters: deposits are money, and this is somebody else's. */
    @Test
    void aUserMayNotSubscribeToSomebodyElsesWallet() {
        UUID me = UUID.randomUUID();
        UUID someoneElse = UUID.randomUUID();

        assertThatThrownBy(() -> subscribe("/topic/wallet/" + someoneElse, me))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("Not your wallet");
    }

    /** A destination is matched case-insensitively, as UUIDs are written both ways. */
    @Test
    void anUppercasedOwnIdIsStillTheirOwnWallet() {
        UUID user = UUID.randomUUID();

        assertThat(subscribe("/topic/wallet/" + user.toString().toUpperCase(), user)).isNotNull();
    }

    @Test
    void anUnauthenticatedSubscribeIsRefused() {
        assertThatThrownBy(() -> subscribe("/topic/wallet/" + UUID.randomUUID(), null))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("Unauthorized");
    }

    /**
     * Refused rather than waved through. The broker serves exactly one topic
     * shape; a permissive default here is how a future destination ships
     * without a check of its own.
     */
    @Test
    void anUnknownDestinationIsRefused() {
        UUID user = UUID.randomUUID();

        assertThatThrownBy(() -> subscribe("/topic/everything", user))
                .isInstanceOf(MessagingException.class)
                .hasMessageContaining("Unknown destination");
        assertThatThrownBy(() -> subscribe("/topic/wallet/" + user + "/extra", user))
                .isInstanceOf(MessagingException.class);
    }

    /** Frames other than CONNECT and SUBSCRIBE pass through untouched. */
    @Test
    void aDisconnectFrameIsNotInterfered() {
        StompHeaderAccessor acc = StompHeaderAccessor.create(StompCommand.DISCONNECT);
        acc.setLeaveMutable(true);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], acc.getMessageHeaders());

        assertThat(interceptor.preSend(message, null)).isSameAs(message);
    }
}
