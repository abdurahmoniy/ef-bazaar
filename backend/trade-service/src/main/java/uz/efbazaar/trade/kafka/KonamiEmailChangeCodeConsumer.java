package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;

/**
 * Consumes Konami email-change verification codes detected by smart-admin's
 * IMAP poller and persists them onto the trade row so the seller can see the
 * code in the trade panel (no need to open the webmail themselves).
 *
 * <p>{@code use.type.headers=false} because smart-admin (Python) stamps the
 * event with its own FQCN in {@code __TypeId__} — the resolver would try to
 * load {@code smart_admin_worker.kafka.events.KonamiEmailChangeCodeReceived}
 * on our classpath and fail.
 *
 * <p>Idempotent: last-write-wins. Konami's server-side TTL is 5 minutes so
 * newer values are always preferable to older ones, and replays are safe.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class KonamiEmailChangeCodeConsumer {

    private final TradeRepository trades;

    @KafkaListener(
            topics = TradeEvents.TOPIC_KONAMI_EMAIL_CHANGE_CODE,
            groupId = "trade-service-konami-email-change-code",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$KonamiEmailChangeCodeReceived",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onCode(TradeEvents.KonamiEmailChangeCodeReceived e) {
        int updated = trades.recordEmailChangeCode(
                e.tradeId(), e.verificationCode(), e.receivedAt());
        if (updated == 0) {
            log.warn("konami-email-change-code for unknown trade {}", e.tradeId());
            return;
        }
        log.info("Recorded Konami email-change verification code for trade {}", e.tradeId());
    }
}
