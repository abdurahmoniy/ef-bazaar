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
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.lang.reflect.Type;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * Whole-branch review Critical #1: SUBSCRIBE frames must be authorized
 * against trade participation, not just CONNECT. Covers:
 *  - a non-participant subscribing to someone else's trade topic → ERROR
 *  - a participant subscribing to the OTHER role's topic → ERROR
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TradeWebSocketAuthzIT extends AbstractIntegrationIT {

    @LocalServerPort int port;
    @Autowired TradeService trades;
    @Autowired TradeRepository tradeRepo;

    /**
     * Marks the invitation as taken. Deliberately not {@code
     * TradeAdminAssignmentService.accept} — that needs a profile row and the
     * trade to already be WAITING_ADMIN — but it writes the same fact the
     * subscribe gate reads. Waits for MockWorker's asynchronous
     * INITIATED -> WAITING_ADMIN first so that transition's own save cannot
     * overwrite the stamp underneath us.
     */
    private void accept(UUID tradeId) {
        await().atMost(10, TimeUnit.SECONDS).until(() ->
                tradeRepo.findById(tradeId).orElseThrow().getState() == TradeState.WAITING_ADMIN);
        var row = tradeRepo.findById(tradeId).orElseThrow();
        row.setAdminAcceptedAt(Instant.now());
        tradeRepo.save(row);
    }

    @Test
    void nonParticipantSubscribeIsRejected() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();

        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(stranger, errors);

        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
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

        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        // Seller is a real participant, but tries to subscribe to the BUYER topic.
        StompSession session = connect(seller, errors);

        session.subscribe("/topic/trades/" + t.id() + "/buyer", new StompFrameHandler() {
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
        TradeResponse t = trades.openTrade(seller, buyer, 80_000L,
                null, null, null, null, TradeMode.HUMAN, admin, 20_000L);
        accept(t.id());

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(admin, errors);

        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { }
        });
        session.subscribe("/topic/trades/" + t.id() + "/buyer", new StompFrameHandler() {
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

        TradeResponse t = trades.openTrade(seller, buyer, 80_000L,
                null, null, null, null, TradeMode.HUMAN, admin, 20_000L);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(admin, errors);

        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
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

        TradeResponse t = trades.openTrade(seller, buyer, 80_000L,
                null, null, null, null, TradeMode.HUMAN, assigned, 20_000L);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(otherAdmin, errors);

        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
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

        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        BlockingQueue<StompHeaders> errors = new ArrayBlockingQueue<>(4);
        StompSession session = connect(buyer, errors);

        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
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
