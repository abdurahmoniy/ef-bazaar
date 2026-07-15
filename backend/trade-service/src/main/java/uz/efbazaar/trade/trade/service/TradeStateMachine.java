package uz.efbazaar.trade.trade.service;

import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;

import java.util.EnumMap;
import java.util.Map;

import static uz.efbazaar.trade.trade.domain.TradeEvent.*;
import static uz.efbazaar.trade.trade.domain.TradeState.*;

/**
 * Hand-rolled state machine — small and inspectable. Spring StateMachine is
 * overkill for a 9-state 9-event graph, and hiding transitions behind Spring
 * config makes reviews harder.
 *
 * <p>Legend for {@link #TRANSITIONS}: an entry {@code (state -> (event -> next))}
 * means the event is legal in that state and moves the trade to {@code next}.
 * A missing entry means the event is illegal and throws
 * {@link InvalidTradeTransitionException}.
 */
@Component
public class TradeStateMachine {

    private static final Map<TradeState, Map<TradeEvent, TradeState>> TRANSITIONS =
            buildTransitions();

    private static Map<TradeState, Map<TradeEvent, TradeState>> buildTransitions() {
        Map<TradeState, Map<TradeEvent, TradeState>> m = new EnumMap<>(TradeState.class);

        m.put(INITIATED, Map.of(
                MAILBOX_PROVISIONED, WAITING_PAYMENT
        ));
        m.put(WAITING_PAYMENT, Map.of(
                PAYMENT_CONFIRMED, WAITING_EMAIL_CHANGE,
                TIMEOUT, ORPHANED
        ));
        m.put(WAITING_EMAIL_CHANGE, Map.of(
                EMAIL_CHANGED, VERIFYING_KONAMI_LINK,
                TIMEOUT, ORPHANED
        ));
        m.put(VERIFYING_KONAMI_LINK, Map.of(
                KONAMI_EMAIL_RECEIVED, WAITING_PASSWORD,
                RECHECK, VERIFYING_KONAMI_LINK,
                TIMEOUT, ORPHANED
        ));
        m.put(WAITING_PASSWORD, Map.of(
                PASSWORD_SENT, WAITING_BUYER_VERIFY,
                TIMEOUT, ORPHANED
        ));
        m.put(WAITING_BUYER_VERIFY, Map.of(
                BUYER_CONFIRM, SUCCESS,
                BUYER_REJECT, REJECTED,
                TIMEOUT, REJECTED
        ));
        // Terminal states — no outgoing transitions.
        m.put(SUCCESS, Map.of());
        m.put(REJECTED, Map.of());
        m.put(ORPHANED, Map.of());

        return m;
    }

    public TradeState transition(TradeState current, TradeEvent event) {
        Map<TradeEvent, TradeState> row = TRANSITIONS.get(current);
        TradeState next = row.get(event);
        if (next == null) {
            throw new InvalidTradeTransitionException(current, event);
        }
        return next;
    }
}
