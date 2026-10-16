package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeState;
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
 * <p>Only fresh codes are accepted; atomic timestamp guards drop stale reports and replays.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class KonamiEmailChangeCodeConsumer {

    private final TradeRepository trades;
    private final TradeSideRepository sideRepo;
    private final TradeSideService sides;
    private final ChatChangePublisher changes;
    private final TradeEventPublisher events;
    private final uz.efbazaar.trade.mailbox.link.LinkSessionService linkSessions;

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
        if (!KonamiOtpCode.isFresh(e.verificationCode(), e.receivedAt())) return;
        var session = linkSessions.liveSessionFor(e.mailboxEmail());
        if (session.isPresent()) {
            linkSessions.onEmailChangeCode(session.get(), e.verificationCode(), e.receivedAt());
            return;
        }
        Trade trade = trades.findById(e.tradeId()).orElse(null);
        if (trade == null || trade.getState().isTerminal()) return;
        var side = sides.byMailboxEmail(e.tradeId(), e.mailboxEmail());
        ParticipantRole owner;
        if (side.isPresent()) {
            owner = side.get().role();
            if (sideRepo.recordEmailChangeCode(e.tradeId(), owner, e.verificationCode(), e.receivedAt()) == 0) return;
            trades.recordEmailChangeCode(e.tradeId(), e.verificationCode(), e.receivedAt());
        } else if ((e.mailboxEmail() == null || e.mailboxEmail().isBlank()) && !trade.getKind().isSwap()) {
            owner = ParticipantRole.SELLER;
            if (trades.recordEmailChangeCode(e.tradeId(), e.verificationCode(), e.receivedAt()) == 0) return;
        } else {
            log.warn("Konami code mailbox does not belong to trade {}", e.tradeId());
            return;
        }
        changes.publishForTrade(e.tradeId());
        if (trade.getState() == TradeState.WAITING_EMAIL_CHANGE) {
            events.tradeAction(trade.getId(), trade.getChatId(),
                    owner == ParticipantRole.SELLER ? trade.getSellerId() : trade.getBuyerId(),
                    TradeEvents.TradeActionType.EMAIL_CHANGE_CODE_RECEIVED, trade.getPriceUzs(),
                    e.verificationCode(), trade.getKind(), e.receivedAt());
        }
        log.info("Recorded Konami email-change code for trade {}", e.tradeId());
    }
}
