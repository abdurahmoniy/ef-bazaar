package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.repository.TradeSideRepository;
import uz.efbazaar.trade.trade.service.TradeSideService;

/**
 * Consumes Konami email-change verification codes detected by smart-admin's
 * IMAP poller and persists them so the party can see the code in the trade
 * panel (no need to open the webmail themselves).
 *
 * <p>Written against the side whose mailbox the mail arrived in. A swap runs
 * two mailboxes and Konami issues each account its own code; kept on the trade
 * alone they overwrite each other, and one party is shown a code minted for
 * somebody else's account, which Konami rejects.
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
    private final TradeSideRepository sideRepo;
    private final TradeSideService sides;
    private final ChatChangePublisher changes;

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
        // Route it to the party whose mailbox it landed in. A swap has two,
        // each with its own code, and the other party's is useless to you —
        // Konami issued it for a different account.
        var side = sides.byMailboxEmail(e.tradeId(), e.mailboxEmail());
        if (side.isPresent()) {
            sideRepo.recordEmailChangeCode(
                    e.tradeId(), side.get().role(), e.verificationCode(), e.receivedAt());
        } else if (e.mailboxEmail() != null) {
            log.warn("konami-email-change-code for trade {} names a mailbox with no side",
                    e.tradeId());
        }

        // The trade-level column stays written for the sale path and for
        // anything still reading it.
        int updated = trades.recordEmailChangeCode(
                e.tradeId(), e.verificationCode(), e.receivedAt());
        if (updated == 0) {
            log.warn("konami-email-change-code for unknown trade {}", e.tradeId());
            return;
        }
        changes.publishForTrade(e.tradeId());
        log.info("Recorded Konami email-change verification code for trade {}", e.tradeId());
    }
}
