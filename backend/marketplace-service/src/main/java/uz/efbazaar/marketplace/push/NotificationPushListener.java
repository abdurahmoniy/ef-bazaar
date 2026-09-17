package uz.efbazaar.marketplace.push;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component @RequiredArgsConstructor @Slf4j
public class NotificationPushListener {
    private final PushDeliveryService delivery;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void committed(NotificationPushEvent event) {
        try { delivery.enqueue(event); }
        catch (RuntimeException error) { log.warn("Push scheduling failed for notification {}", event.data().get("notificationId")); }
    }
}
