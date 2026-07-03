package uz.efbazaar.auth.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.Optional;

/**
 * Enriches marketplace's {@code chat-created} event with buyer/seller Telegram
 * identity and republishes as {@code efbazaar.notifications.chat-created}.
 *
 * <p>This keeps auth as the sole owner of Telegram IDs — the bot consumes only
 * the denormalized notification and never queries auth's DB directly.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ChatCreatedEnricher {

    static final String INPUT_TOPIC = "efbazaar.marketplace.chat-created";
    static final String OUTPUT_TOPIC = "efbazaar.notifications.chat-created";

    private final UserRepository userRepository;
    private final KafkaTemplate<String, Object> kafka;

    @KafkaListener(
            topics = INPUT_TOPIC,
            groupId = "auth-service-chat-notifier",
            properties = {"spring.json.value.default.type=uz.efbazaar.auth.kafka.ChatCreatedDto"}
    )
    @Transactional(readOnly = true)
    public void onChatCreated(ChatCreatedDto e) {
        Optional<User> sellerOpt = userRepository.findById(e.sellerId());
        if (sellerOpt.isEmpty()) {
            log.warn("chat-created: seller {} not found — dropping notification", e.sellerId());
            return;
        }
        Optional<User> buyerOpt = userRepository.findById(e.buyerId());
        if (buyerOpt.isEmpty()) {
            log.warn("chat-created: buyer {} not found — dropping notification", e.buyerId());
            return;
        }

        User seller = sellerOpt.get();
        User buyer = buyerOpt.get();

        ChatNotificationEvent notification = new ChatNotificationEvent(
                e.chatId(),
                e.listingId(),
                e.buyerId(),
                e.sellerId(),
                seller.getTelegramId(),
                displayName(buyer),
                buyer.getTelegramUsername(),
                e.occurredAt()
        );

        kafka.send(OUTPUT_TOPIC, e.sellerId().toString(), notification);
        log.info("Emitted chat notification for chatId={} sellerTelegramId={}",
                e.chatId(), seller.getTelegramId());
    }

    private static String displayName(User user) {
        if (user.getTelegramFirstName() != null && !user.getTelegramFirstName().isBlank()) {
            String last = user.getTelegramLastName();
            return last != null && !last.isBlank()
                    ? user.getTelegramFirstName() + " " + last
                    : user.getTelegramFirstName();
        }
        if (user.getGoogleGivenName() != null && !user.getGoogleGivenName().isBlank()) {
            return user.getGoogleGivenName();
        }
        if (user.getTelegramUsername() != null && !user.getTelegramUsername().isBlank()) {
            return "@" + user.getTelegramUsername();
        }
        return "Xaridor";
    }
}
