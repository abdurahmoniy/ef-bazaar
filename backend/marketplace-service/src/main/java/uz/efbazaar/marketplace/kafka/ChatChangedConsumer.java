package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.websocket.ChatSocketSignals;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ChatChangedConsumer {
    private final ChatSocketSignals signals;
    public record Changed(UUID chatId) {}

    @KafkaListener(topics = "chat.changed.v1", groupId = "marketplace-chat-realtime",
            properties = {"spring.json.value.default.type=uz.efbazaar.marketplace.kafka.ChatChangedConsumer$Changed",
                    "spring.json.use.type.headers=false"})
    public void onChanged(Changed event) {
        if (event != null && event.chatId() != null) signals.changed(event.chatId());
    }
}
