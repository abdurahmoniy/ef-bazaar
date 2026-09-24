package uz.efbazaar.trade.ws;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
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
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.mailbox.service.MailboxService;
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TradeWebSocketIT extends AbstractIntegrationIT {

    @LocalServerPort int port;
    @Autowired TradeService trades;
    @Autowired TradeRepository tradeRepo;
    @Autowired MailboxService mailboxes;

    @Test
    void sellerReceivesStateChange() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();

        // Seed the state under test without provisioning over Kafka. Other
        // cached Spring contexts share the worker consumer groups in the full
        // suite, so this context need not own their partitions.
        Trade t = tradeRepo.save(Trade.builder()
                .id(UUID.randomUUID()).sellerId(seller).buyerId(buyer)
                .priceUzs(500_000L).state(TradeState.WAITING_EMAIL_CHANGE)
                .mailboxId(mailboxes.createPlaceholder("pending-" + UUID.randomUUID() + "@efbazaar.uz"))
                .expiresAt(Instant.now().plusSeconds(3600))
                .build());

        var sockJs = new SockJsClient(List.of(new WebSocketTransport(new StandardWebSocketClient())));
        var stomp = new WebSocketStompClient(sockJs);
        stomp.setMessageConverter(new MappingJackson2MessageConverter());

        WebSocketHttpHeaders headers = new WebSocketHttpHeaders();
        headers.add("X-User-Id", seller.toString());
        headers.add("X-User-Roles", "ROLE_USER");

        StompSession session = stomp
                .connectAsync("ws://localhost:" + port + "/ws/trade", headers,
                        new StompSessionHandlerAdapter() {})
                .get(5, TimeUnit.SECONDS);

        BlockingQueue<Object> queue = new ArrayBlockingQueue<>(4);
        session.subscribe("/topic/trades/" + t.getId() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { queue.offer(payload); }
        });

        // No provisioning request or deadline can advance this fixture.
        trades.transition(t.getId(), TradeEvent.TIMEOUT, ActorType.SYSTEM, null);

        Object frame = queue.poll(5, TimeUnit.SECONDS);
        assertThat(frame).isNotNull();
        assertThat(frame.toString()).contains("ORPHANED");
    }
}
