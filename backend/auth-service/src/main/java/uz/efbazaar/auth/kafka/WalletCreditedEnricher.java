package uz.efbazaar.auth.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.repository.UserRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Enriches payment-service's {@code deposit-credited} with the recipient's
 * Telegram identity and republishes it for the bot.
 *
 * <p>Same shape as {@link ChatCreatedEnricher}, and for the same reason: auth
 * is the sole owner of Telegram IDs, so the bot consumes a denormalized
 * notification and never has to resolve a user itself.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WalletCreditedEnricher {

    static final String INPUT_TOPIC = "efbazaar.payment.deposit-credited";
    static final String OUTPUT_TOPIC = "efbazaar.notifications.wallet-credited";

    private final UserRepository userRepository;
    private final KafkaTemplate<String, Object> kafka;

    /**
     * What the bot receives.
     *
     * @param balanceAfterTiyin what the wallet held when the event was built,
     *                          or null if payment-service could not read it.
     *                          The message simply omits the line in that case.
     */
    public record WalletCreditedNotification(UUID userId, Long recipientTelegramId,
                                             long amountTiyin, Long balanceAfterTiyin,
                                             Instant occurredAt) {}

    // use.type.headers=false: payment-service stamps __TypeId__ with its own
    // class name, which does not exist here. Without this the deserializer
    // throws inside poll(), where no error handler can reach it, and the
    // container re-polls the same record forever.
    @KafkaListener(
            topics = INPUT_TOPIC,
            groupId = "auth-service-wallet-notifier",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.auth.kafka.DepositCreditedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional(readOnly = true)
    public void onDepositCredited(DepositCreditedDto e) {
        if (e == null || e.userId() == null || e.amountTiyin() == null) {
            log.warn("deposit-credited with no user or amount, skipping");
            return;
        }

        Optional<User> user = userRepository.findById(e.userId());
        if (user.isEmpty()) {
            log.warn("deposit-credited: user {} not found — no DM", e.userId());
            return;
        }
        Long telegramId = user.get().getTelegramId();
        if (telegramId == null) {
            // A Google-only account. The bell notification is already written
            // by marketplace-service and reaches them there; this path just has
            // nowhere to send.
            log.debug("deposit-credited: user {} has no Telegram linked", e.userId());
            return;
        }

        kafka.send(OUTPUT_TOPIC, e.userId().toString(), new WalletCreditedNotification(
                e.userId(), telegramId, e.amountTiyin(), e.balanceAfterTiyin(),
                e.occurredAt() == null ? Instant.now() : e.occurredAt()));
        log.info("Emitted wallet-credited notification for user={}", e.userId());
    }
}
