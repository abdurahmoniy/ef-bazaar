package uz.efbazaar.trade.trade.ws;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.dto.TradeResponse;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class TradeBroadcaster {

    private final SimpMessagingTemplate ws;

    /** Publish the same TradeResponse to both role topics — clients render only their own actions. */
    public void publishStateChange(UUID tradeId, TradeResponse response) {
        ws.convertAndSend("/topic/trades/" + tradeId + "/seller",
                response.role() == ParticipantRole.SELLER ? response : withRole(response, ParticipantRole.SELLER));
        ws.convertAndSend("/topic/trades/" + tradeId + "/buyer",
                response.role() == ParticipantRole.BUYER ? response : withRole(response, ParticipantRole.BUYER));
    }

    public void publishMessage(UUID tradeId, ParticipantRole targetRole, TradeMessageResponse msg) {
        String role = targetRole == ParticipantRole.SELLER ? "seller" : "buyer";
        ws.convertAndSend("/topic/trades/" + tradeId + "/" + role, msg);
    }

    private static TradeResponse withRole(TradeResponse r, ParticipantRole role) {
        return new TradeResponse(r.id(), r.state(), r.sellerId(), r.buyerId(),
                r.priceUzs(), r.mailboxId(), r.createdAt(), r.expiresAt(),
                r.stateDeadline(), role);
    }
}
