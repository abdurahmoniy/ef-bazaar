package uz.efbazaar.marketplace.push;

import com.google.firebase.messaging.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import java.util.Map;

@Slf4j
@RequiredArgsConstructor
public class FirebasePushSender implements PushSender {
    private final FirebaseMessaging messaging;

    @Override
    public Result send(String token, Map<String, String> data) {
        try {
            messaging.send(Message.builder().setToken(token).putAllData(data)
                    .setWebpushConfig(WebpushConfig.builder()
                            .putHeader("TTL", "86400").putHeader("Urgency", "high").build())
                    .build());
            return Result.SENT;
        } catch (FirebaseMessagingException error) {
            if (error.getMessagingErrorCode() == MessagingErrorCode.UNREGISTERED) return Result.INVALID_TOKEN;
            // Do not log exception messages: upstream errors can include registration tokens.
            log.warn("Firebase push delivery failed: {}", error.getMessagingErrorCode());
            return Result.RETRY_LATER;
        }
    }
}
