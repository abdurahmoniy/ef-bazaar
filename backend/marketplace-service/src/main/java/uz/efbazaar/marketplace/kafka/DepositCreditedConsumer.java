package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.service.NotificationService;

/**
 * Puts "your wallet was topped up" in the bell the user already has.
 *
 * <p>Until now this topic had no consumer at all: payment-service published
 * every credited deposit and nothing anywhere listened, so a user who paid had
 * to go and look.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DepositCreditedConsumer {

    private final NotificationService notifications;

    // use.type.headers=false is load-bearing, not boilerplate. payment-service
    // publishes with a JsonSerializer, which stamps __TypeId__ with ITS class
    // name — a class this service does not have. Without this the deserializer
    // throws ClassNotFoundException inside poll(), where no error handler can
    // reach it: the offset is never committed and the container re-polls the
    // same record forever.
    @KafkaListener(
            topics = "efbazaar.payment.deposit-credited",
            groupId = "marketplace-deposit-credited",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.DepositCreditedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onCredited(DepositCreditedDto e) {
        if (e == null || e.userId() == null || e.amountTiyin() == null) {
            log.warn("deposit-credited with no user or amount, skipping: {}", e);
            return;
        }
        notifications.walletCredited(e.userId(), e.amountTiyin(), e.transactionId());
    }
}
