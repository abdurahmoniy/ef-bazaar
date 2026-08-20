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

    /**
     * Each party gets a response built for them.
     *
     * <p>Not one response with the role swapped, which is what this used to
     * do: a swap gives the two sides different escrow mailboxes, and cloning
     * one view for both sent each party the other's address — so both were
     * told to move their account into the same box.
     */
    public void publishStateChange(UUID tradeId, TradeResponse forSeller, TradeResponse forBuyer) {
        runAfterCommitIfActive(() -> {
            ws.convertAndSend("/topic/trades/" + tradeId + "/seller", forSeller);
            ws.convertAndSend("/topic/trades/" + tradeId + "/buyer", forBuyer);
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

}
