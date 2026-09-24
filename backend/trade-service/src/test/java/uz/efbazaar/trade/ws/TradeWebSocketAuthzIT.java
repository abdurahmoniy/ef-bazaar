package uz.efbazaar.trade.ws;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import org.springframework.web.socket.sockjs.client.SockJsClient;
import org.springframework.web.socket.sockjs.client.WebSocketTransport;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.lang.reflect.Type;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Whole-branch review Critical #1: SUBSCRIBE frames must be authorized
 * against trade participation, not just CONNECT. Covers:
 *  - a non-participant subscribing to someone else's trade topic → ERROR
 *  - a participant subscribing to the OTHER role's topic → ERROR
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TradeWebSocketAuthzIT extends AbstractIntegrationIT {

    @LocalServerPort int port;
    @Autowired TradeRepository tradeRepo;
    @Autowired MailboxService mailboxes;

    /** Seed only the persisted facts the WebSocket subscribe gate reads. */
    private Trade givenTrade(UUID seller, UUID buyer, UUID admin) {
        return tradeRepo.save(Trade.builder()
                .id(UUID.randomUUID()).sellerId(seller).buyerId(buyer)
                .priceUzs(80_000L)
                .mode(admin == null ? TradeMode.SMART : TradeMode.HUMAN)
                .state(admin == null ? TradeState.WAITING_EMAIL_CHANGE : TradeState.WAITING_ADMIN)
                .assignedAdminId(admin)
                .mailboxId(mailboxes.createPlaceholder("pending-" + UUID.randomUUID() + "@efbazaar.uz"))
                .expiresAt(Instant.now().plusSeconds(3600))
                .build());
    }

    private void accept(UUID tradeId) {
        var row = tradeRepo.findById(tradeId).orElseThrow();
        row.setState(TradeState.IN_PROGRESS);
        row.setAdminAcceptedAt(Instant.now());
        tradeRepo.save(row);
    }

    @Test
    void nonParticipantSubscribeIsRejected() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();

        Trade t = givenTrade(seller, buyer, null);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(stranger, errors);

        session.subscribe("/topic/trades/" + t.getId() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { /* should never fire */ }
        });

        StompHeaders errorFrame = errors.poll(5, TimeUnit.SECONDS);
        assertThat(errorFrame).as("expected an ERROR frame for a non-participant SUBSCRIBE").isNotNull();
    }

    @Test
    void wrongRoleSubscribeIsRejected() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();

        Trade t = givenTrade(seller, buyer, null);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        // Seller is a real participant, but tries to subscribe to the BUYER topic.
        StompSession session = connect(seller, errors);

        session.subscribe("/topic/trades/" + t.getId() + "/buyer", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { /* should never fire */ }
        });

        StompHeaders errorFrame = errors.poll(5, TimeUnit.SECONDS);
        assertThat(errorFrame).as("expected an ERROR frame for a role-mismatched SUBSCRIBE").isNotNull();
    }

    @Test
    void assignedAdminMaySubscribeToBothPartyTopics() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        UUID admin  = UUID.randomUUID();

        // HUMAN trade, no cards, this admin assigned AND accepted — live push
        // is a chat read, so it opens at accept (spec §6.1), not at invite.
        Trade t = givenTrade(seller, buyer, admin);
        accept(t.getId());

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(admin, errors);

        session.subscribe("/topic/trades/" + t.getId() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });
        session.subscribe("/topic/trades/" + t.getId() + "/buyer", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });

        // Following both party chats is the whole shape of a human trade.
        // An absence assertion wants the longer window — the isNotNull cases
        // below get 5 s, so this one should too, or it risks a false pass on
        // a loaded CI runner.
        assertThat(errors.poll(5, TimeUnit.SECONDS))
                .as("assigned admin must be allowed on both party topics")
                .isNull();
    }

    /**
     * The live-push half of spec §6.1: an admin still deciding on the
     * invitation must not be able to follow the party topics either, or they
     * could subscribe, watch both conversations in real time, and then decline.
     */
    @Test
    void invitedButNotYetAcceptedAdminSubscribeIsRejected() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        UUID admin  = UUID.randomUUID();

        Trade t = givenTrade(seller, buyer, admin);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(admin, errors);

        session.subscribe("/topic/trades/" + t.getId() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });

        assertThat(errors.poll(5, TimeUnit.SECONDS))
                .as("chat access starts at accept, not at invite")
                .isNotNull();
    }

    @Test
    void unassignedTradeAdminSubscribeIsRejected() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        UUID assigned = UUID.randomUUID();
        UUID otherAdmin = UUID.randomUUID();

        Trade t = givenTrade(seller, buyer, assigned);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(otherAdmin, errors);

        session.subscribe("/topic/trades/" + t.getId() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });

        assertThat(errors.poll(5, TimeUnit.SECONDS))
                .as("a trade admin not assigned to this trade is just a stranger")
                .isNotNull();
    }

    @Test
    void smartTradeStillRejectsAWrongRoleSubscribe() throws Exception {
        // Guards that widening the check for admins did not loosen it for parties.
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();

        Trade t = givenTrade(seller, buyer, null);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(buyer, errors);

        session.subscribe("/topic/trades/" + t.getId() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });

        assertThat(errors.poll(5, TimeUnit.SECONDS)).isNotNull();
    }

    private StompSession connect(UUID userId, BlockingQueue<StompHeaders> errors) throws Exception {
        var sockJs = new SockJsClient(List.of(new WebSocketTransport(new StandardWebSocketClient())));
        var stomp = new WebSocketStompClient(sockJs);
        stomp.setMessageConverter(new MappingJackson2MessageConverter());

        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add("X-User-Id", userId.toString());
        headers.add("X-User-Roles", "ROLE_USER");

        // The ERROR frame's handler MUST be registered before the SUBSCRIBE
        // call — it arrives on the session-level StompSessionHandler, not a
        // per-subscription StompFrameHandler, and can arrive before
        // session.subscribe(...) even returns.
        return stomp.connectAsync("ws://localhost:" + port + "/ws/trade", headers,
                        new StompSessionHandlerAdapter() {
                            // Server-sent ERROR frames are routed to the top-level
                            // session handler's handleFrame (not to a per-subscription
                            // StompFrameHandler) — see DefaultStompSession.handleMessage.
                            @Override
                            public void handleFrame(StompHeaders stompHeaders, Object payload) {
                                errors.offer(stompHeaders);
                            }

                            @Override
                            public void handleException(StompSession session, StompCommand command,
                                                        StompHeaders stompHeaders, byte[] payload, Throwable exception) {
                                errors.offer(stompHeaders);
                            }
                        })
                .get(5, TimeUnit.SECONDS);
    }
}
