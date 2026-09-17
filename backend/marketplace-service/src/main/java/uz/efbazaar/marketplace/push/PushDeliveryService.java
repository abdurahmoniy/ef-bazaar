package uz.efbazaar.marketplace.push;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import uz.efbazaar.marketplace.repository.PushTokenRepository;
import java.util.concurrent.Executor;

@Service @Slf4j
public class PushDeliveryService {
    private final PushTokenRepository tokens;
    private final PushSender sender;
    private final Executor executor;
    private final PushProperties properties;

    public PushDeliveryService(PushTokenRepository tokens, PushSender sender,
                               @Qualifier("pushExecutor") Executor executor, PushProperties properties) {
        this.tokens = tokens; this.sender = sender; this.executor = executor; this.properties = properties;
    }

    public void enqueue(NotificationPushEvent event) {
        if (!properties.isEnabled()) return;
        try { executor.execute(() -> deliver(event)); }
        catch (RuntimeException error) { log.warn("Push queue unavailable for notification {}", event.data().get("notificationId")); }
    }

    private void deliver(NotificationPushEvent event) {
        try {
            for (String token : tokens.findByUserId(event.recipientUserId())) {
                try {
                    if (sender.send(token, event.data()) == PushSender.Result.INVALID_TOKEN) {
                        tokens.remove(event.recipientUserId(), token);
                    }
                } catch (RuntimeException error) {
                    log.warn("Push device delivery failed for notification {}", event.data().get("notificationId"));
                }
            }
        } catch (RuntimeException error) {
            log.warn("Push device lookup failed for notification {}", event.data().get("notificationId"));
        }
    }
}
