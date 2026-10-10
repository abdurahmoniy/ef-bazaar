package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeSide;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.service.TradeService;

@Slf4j
@Component
@RequiredArgsConstructor
public class KonamiEmailReceivedConsumer {

    private final TradeService trades;
    private final uz.efbazaar.trade.trade.service.TradeSideService sides;
    private final ChatChangePublisher changes;

    @KafkaListener(
            topics = TradeEvents.TOPIC_KONAMI_EMAIL,
            groupId = "trade-service-konami-email",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$KonamiEmailReceived"}
    )
    public void onKonamiEmail(TradeEvents.KonamiEmailReceived e) {
        if (e.emailNotRegistered()) {
            warnNotRegistered(e);
            return;
        }
        if (!e.resetLinkPresent()) {
            log.info("konami-email-received (no reset link) for trade {}, keeping state 4",
                    e.tradeId());
            return;
        }
        // Xat qaysi qutiga kelgan bo'lsa, o'sha tarafga yoziladi. Obmenda
        // bu HAL QILUVCHI: manzilsiz trade-service uni "hali bajarmagan
        // birinchi tarafga" yozardi, ya'ni bir tomonning parol tiklashi
        // ikkinchisiniki bo'lib hisoblanardi. Eski hodisalarda manzil
        // yo'q — o'shanda avvalgi taxminiy xulq saqlanadi.
        ParticipantRole side = sides.byMailboxEmail(e.tradeId(), e.mailboxEmail())
                .map(TradeSide::role)
                .orElse(null);
        try {
            trades.transition(e.tradeId(), TradeEvent.KONAMI_EMAIL_RECEIVED,
                    ActorType.WORKER, null, side);
        } catch (InvalidTradeTransitionException ex) {
            // Kafka is at-least-once; the trade may have already moved past
            // VERIFYING_KONAMI_LINK (e.g. a caller drove the transition
            // directly, or this is a redelivery/duplicate IMAP hit). Not a
            // failure worth crash-looping the listener over.
            log.warn("konami-email-received for trade {} arrived after state moved on: {}",
                    e.tradeId(), ex.getMessage());
        }
    }

    /**
     * Konami answered the reset with "this email address is not registered to
     * a KONAMI ID": the party has not moved their account email to our box.
     * The trade stays on this step; the panel tells that party to move it and
     * ask for the reset again. The worker keeps watching for the real link.
     */
    private void warnNotRegistered(TradeEvents.KonamiEmailReceived e) {
        // Faqat aniq taraf: ogohlantirishni boshqa odamga ko'rsatish uni
        // chalg'itadi, u esa hech narsani noto'g'ri qilmagan.
        var side = sides.byMailboxEmail(e.tradeId(), e.mailboxEmail());
        if (side.isEmpty()) {
            log.warn("konami-email-received (not registered) for trade {}: mailbox {} matches no side, dropped",
                    e.tradeId(), e.mailboxEmail());
            return;
        }
        ParticipantRole role = side.get().role();
        if (sides.markKonamiNotRegistered(e.tradeId(), role)) {
            log.info("konami-email-received (not registered) for trade {} {}, keeping state 4",
                    e.tradeId(), role);
            changes.publishForTrade(e.tradeId());
        }
    }
}
