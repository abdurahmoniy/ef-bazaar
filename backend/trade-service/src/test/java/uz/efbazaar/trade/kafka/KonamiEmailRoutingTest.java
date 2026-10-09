package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeSide;
import uz.efbazaar.trade.trade.domain.TradeSideId;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeSideService;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Parol tiklash xati kimning qadamini yopadi.
 *
 * <p>Obmenda ikkita quti bor va har taraf o'z akkountini O'Z qutisi orqali
 * o'tkazadi. Xat qaysi qutiga kelgan bo'lsa, qadam ham o'shaning tarafiniki.
 *
 * <p>Ilgari hodisada manzil yo'q edi va trade-service uni "hali bajarmagan
 * birinchi tarafga" yozardi — ya'ni bir tomonning parol tiklashi
 * ikkinchisiniki bo'lib hisoblanardi. Jonli obmenda aynan shu ko'rindi:
 * bir tomonda "ishladi", ikkinchisida "yo'q".
 */
@ExtendWith(MockitoExtension.class)
class KonamiEmailRoutingTest {

    @Mock TradeService trades;
    @Mock TradeSideService sides;
    @Mock ChatChangePublisher changes;
    @InjectMocks KonamiEmailReceivedConsumer consumer;

    private final UUID tradeId = UUID.randomUUID();

    private static TradeSide side(UUID tradeId, ParticipantRole role) {
        return TradeSide.builder().id(new TradeSideId(tradeId, role)).build();
    }

    private TradeEvents.KonamiEmailReceived event(String mailbox) {
        return new TradeEvents.KonamiEmailReceived(
                tradeId, true, "konami-info@konami.net", Instant.now(), mailbox, false);
    }

    @Test
    void theResetClosesTheStepOfTheMailboxItLandedIn() {
        when(sides.byMailboxEmail(tradeId, "trade-b@efbazaar.uz"))
                .thenReturn(Optional.of(side(tradeId, ParticipantRole.BUYER)));

        consumer.onKonamiEmail(event("trade-b@efbazaar.uz"));

        verify(trades).transition(eq(tradeId), eq(TradeEvent.KONAMI_EMAIL_RECEIVED),
                eq(ActorType.WORKER), isNull(), eq(ParticipantRole.BUYER));
    }

    @Test
    void anUnknownMailboxFallsBackToTheOldGuess() {
        // Eski hodisalarda manzil yo'q. Ularni tashlab yuborish savdoni
        // to'xtatib qo'yardi, shuning uchun avvalgi xulq saqlanadi:
        // tarafni ko'rsatmaymiz va u "birinchi bajarmagan"ga yoziladi.
        when(sides.byMailboxEmail(tradeId, null)).thenReturn(Optional.empty());

        consumer.onKonamiEmail(event(null));

        verify(trades).transition(eq(tradeId), eq(TradeEvent.KONAMI_EMAIL_RECEIVED),
                eq(ActorType.WORKER), isNull(), isNull());
    }

    @Test
    void anEmailWithoutAResetLinkChangesNothing() {
        consumer.onKonamiEmail(new TradeEvents.KonamiEmailReceived(
                tradeId, false, "konami-info@konami.net", Instant.now(), "trade-a@efbazaar.uz", false));

        verify(trades, org.mockito.Mockito.never())
                .transition(eq(tradeId), eq(TradeEvent.KONAMI_EMAIL_RECEIVED),
                        eq(ActorType.WORKER), isNull(), org.mockito.ArgumentMatchers.any());
    }

    /**
     * Konami pochta Konami ID ga ulanmagan bo'lsa ham "Reissue Password"
     * sarlavhasi bilan javob beradi. Savdo shu qadamda qoladi, lekin aynan
     * shu qutining egasi emailni o'tkazmaganini panelda ko'rishi kerak —
     * aks holda deadline tugaguncha nega hech narsa bo'lmayotganini bilmaydi.
     */
    @Test
    void aNotRegisteredReplyWarnsTheSideItLandedInAndKeepsTheStep() {
        when(sides.byMailboxEmail(tradeId, "trade-b@efbazaar.uz"))
                .thenReturn(Optional.of(side(tradeId, ParticipantRole.BUYER)));
        when(sides.markKonamiNotRegistered(tradeId, ParticipantRole.BUYER)).thenReturn(true);

        consumer.onKonamiEmail(new TradeEvents.KonamiEmailReceived(
                tradeId, false, "konami-info@konami.net", Instant.now(), "trade-b@efbazaar.uz", true));

        verify(sides).markKonamiNotRegistered(tradeId, ParticipantRole.BUYER);
        verify(changes).publishForTrade(tradeId);
        verify(trades, org.mockito.Mockito.never())
                .transition(any(), any(), any(), any(), any());
    }

    @Test
    void aNotRegisteredReplyForAnUnknownMailboxIsDropped() {
        // Qaysi tarafga yozishni bilmasak, ogohlantirishni noto'g'ri odamga
        // ko'rsatgandan ko'ra tashlab yuborgan ma'qul.
        when(sides.byMailboxEmail(tradeId, "gone@efbazaar.uz")).thenReturn(Optional.empty());

        consumer.onKonamiEmail(new TradeEvents.KonamiEmailReceived(
                tradeId, false, "konami-info@konami.net", Instant.now(), "gone@efbazaar.uz", true));

        verify(sides, org.mockito.Mockito.never()).markKonamiNotRegistered(any(), any());
        verify(changes, org.mockito.Mockito.never()).publishForTrade(any());
    }
}
