package uz.efbazaar.payment.notify;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import uz.efbazaar.payment.kafka.PaymentEventPublisher;

import java.time.Instant;
import java.util.UUID;

/**
 * Tells an open wallet page that its deposit has landed.
 *
 * <p>Listens to the same {@code DepositCreditedSignal} the Kafka publisher
 * does, and nothing in the crediting path knows this exists — a live push is an
 * announcement, never a step in moving money.
 *
 * <p>{@code AFTER_COMMIT}, like every other announcement here: a page told a
 * deposit arrived before the transaction commits would show a balance a
 * rollback then takes back, and there is no retraction frame to send.
 *
 * <p>Nothing here throws. A browser that has closed its socket, a broker that
 * refuses, a serialization fault — none of them may reach a caller whose money
 * has already moved. The page falls back to what it does today: the figures are
 * correct on the next load.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WalletLivePush {

    /** One destination per user; subscribing to somebody else's is refused. */
    public static final String WALLET_TOPIC = "/topic/wallet/";

    private final SimpMessagingTemplate messaging;

    /**
     * What a subscriber receives.
     *
     * <p>{@code amountTiyin} is what reached the wallet, not what was
     * transferred: a bumped invoice asks for a few tiyin more so the incoming
     * notification can be told apart from somebody else's, and showing the
     * transfer amount here would tell the user they received more than they
     * did.
     */
    public record WalletCredited(String type, UUID invoiceId, long amountTiyin, Instant occurredAt) {

        static WalletCredited of(UUID invoiceId, long amountTiyin) {
            return new WalletCredited("DEPOSIT_CREDITED", invoiceId, amountTiyin, Instant.now());
        }
    }

    @TransactionalEventListener
    public void onDepositCredited(PaymentEventPublisher.DepositCreditedSignal signal) {
        try {
            messaging.convertAndSend(WALLET_TOPIC + signal.userId(),
                    WalletCredited.of(signal.invoiceId(), signal.amountTiyin()));
        } catch (Exception e) {
            // Debug, not warn: nobody being connected is the ordinary case —
            // most deposits land while the page is closed.
            log.debug("Wallet push for invoice {} was not delivered: {}",
                    signal.invoiceId(), e.toString());
        }
    }
}
