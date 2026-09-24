package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;

import java.util.UUID;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;

import static org.mockito.Mockito.*;

class TradeBroadcasterChatTest {
    private final SimpMessagingTemplate ws = mock(SimpMessagingTemplate.class);
    private final ChatChangePublisher changes = mock(ChatChangePublisher.class);
    private final TradeBroadcaster broadcaster = new TradeBroadcaster(ws, changes);

    @Test
    void everyTradeStateAndSideProgressBroadcastInvalidatesItsChat() {
        UUID tradeId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        TradeResponse seller = new ObjectMapper().convertValue(
                Map.of("id", tradeId, "chatId", chatId, "role", "SELLER"), TradeResponse.class);
        TradeResponse buyer = new ObjectMapper().convertValue(
                Map.of("id", tradeId, "chatId", chatId, "role", "BUYER"), TradeResponse.class);
        broadcaster.publishStateChange(tradeId, seller, buyer);
        verify(changes).publish(chatId);
        verify(ws).convertAndSend("/topic/trades/" + tradeId + "/seller", seller);
        verify(ws).convertAndSend("/topic/trades/" + tradeId + "/buyer", buyer);
    }

    @Test
    void messagesAndPrivateCodesInvalidateWithoutPublishingTheirContents() {
        UUID tradeId = UUID.randomUUID();
        TradeMessageResponse message = new TradeMessageResponse(UUID.randomUUID(), null, null,
                "private message", Map.of("code", "123456"), null);
        broadcaster.publishMessage(tradeId, ParticipantRole.BUYER, message);
        verify(changes).publishForTrade(tradeId);
        verify(ws).convertAndSend("/topic/trades/" + tradeId + "/buyer", message);
    }
}
