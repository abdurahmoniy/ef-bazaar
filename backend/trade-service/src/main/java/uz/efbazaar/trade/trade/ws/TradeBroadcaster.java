package uz.efbazaar.trade.trade.ws;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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
        runAfterCommitIfActive(() -> {
            ws.convertAndSend("/topic/trades/" + tradeId + "/seller",
                    response.role() == ParticipantRole.SELLER ? response : withRole(response, ParticipantRole.SELLER));
            ws.convertAndSend("/topic/trades/" + tradeId + "/buyer",
                    response.role() == ParticipantRole.BUYER ? response : withRole(response, ParticipantRole.BUYER));
        });
    }

    public void publishMessage(UUID tradeId, ParticipantRole targetRole, TradeMessageResponse msg) {
        String role = targetRole == ParticipantRole.SELLER ? "seller" : "buyer";
        runAfterCommitIfActive(() -> ws.convertAndSend("/topic/trades/" + tradeId + "/" + role, msg));
    }

    /**
     * Defers the broadcast to run after the enclosing transaction commits,
     * when one is active — otherwise a subscriber reacting to the broadcast
     * (e.g. re-fetching trade state over REST) can race a not-yet-committed
     * write and observe stale data. Sends synchronously outside a transaction
     * (same pattern as {@link uz.efbazaar.trade.kafka.TradeEventPublisher#send}).
     */
    private void runAfterCommitIfActive(Runnable publish) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish.run();
                }
            });
        } else {
            publish.run();
        }
    }

    private static TradeResponse withRole(TradeResponse r, ParticipantRole role) {
        return new TradeResponse(r.id(), r.state(), r.sellerId(), r.buyerId(),
                r.priceUzs(), r.mailboxId(), r.mailboxEmail(), r.chatId(), r.createdAt(),
                r.expiresAt(), r.stateDeadline(), role, r.passwordMessageId(),
                r.emailChangeVerificationCode(), r.kind(), r.sides());
    }
}
