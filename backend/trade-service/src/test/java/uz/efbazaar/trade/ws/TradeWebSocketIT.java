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
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeService;

import java.lang.reflect.Type;
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

    @Test
    void sellerReceivesStateChange() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();

        TradeResponse t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

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
        session.subscribe("/topic/trades/" + t.id() + "/seller", new StompFrameHandler() {
            @Override public Type getPayloadType(StompHeaders headers) { return java.util.Map.class; }
            @Override public void handleFrame(StompHeaders headers, Object payload) { queue.offer(payload); }
        });

        // Fire a state change — MAILBOX_PROVISIONED brings us to WAITING_PAYMENT
        trades.transition(t.id(), TradeEvent.MAILBOX_PROVISIONED, ActorType.SYSTEM, null);

        Object frame = queue.poll(5, TimeUnit.SECONDS);
        assertThat(frame).isNotNull();
        assertThat(frame.toString()).contains("WAITING_PAYMENT");
    }
}
