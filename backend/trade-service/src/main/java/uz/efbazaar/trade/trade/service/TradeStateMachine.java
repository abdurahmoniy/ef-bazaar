package uz.efbazaar.trade.trade.service;

import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;

import java.util.EnumMap;
import java.util.Map;

import static uz.efbazaar.trade.trade.domain.TradeEvent.*;
import static uz.efbazaar.trade.trade.domain.TradeState.*;

/**
 * Hand-rolled state machine — small and inspectable. Spring StateMachine is
 * overkill, and hiding transitions behind Spring config makes reviews harder.
 *
 * <p>There is one table per {@link TradeMode}. This is deliberate and stronger
 * than a shared table with runtime guards: a HUMAN trade has no
 * {@code WAITING_PAYMENT} row and so cannot enter the smart path, and a SMART
 * trade has no {@code IN_PROGRESS} row and so cannot enter the human path.
 * The two lifecycles are structurally incapable of crossing.
 *
 * <p>The only state whose row differs is {@code INITIATED}: the same
 * {@code MAILBOX_PROVISIONED} event leads to {@code WAITING_PAYMENT} under
 * SMART and {@code WAITING_ADMIN} under HUMAN.
 */
@Component
public class TradeStateMachine {

    private static final Map<TradeMode, Map<TradeState, Map<TradeEvent, TradeState>>> TABLES =
            buildTables();

    private static Map<TradeMode, Map<TradeState, Map<TradeEvent, TradeState>>> buildTables() {
        Map<TradeMode, Map<TradeState, Map<TradeEvent, TradeState>>> all =
                new EnumMap<>(TradeMode.class);
        all.put(TradeMode.SMART, smart());
        all.put(TradeMode.HUMAN, human());
        return all;
    }

    private static Map<TradeState, Map<TradeEvent, TradeState>> smart() {
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
        terminals(m);
        return m;
    }

    private static Map<TradeState, Map<TradeEvent, TradeState>> human() {
        Map<TradeState, Map<TradeEvent, TradeState>> m = new EnumMap<>(TradeState.class);
        m.put(INITIATED, Map.of(
                MAILBOX_PROVISIONED, WAITING_ADMIN
        ));
        m.put(WAITING_ADMIN, Map.of(
                ADMIN_ACCEPTED, IN_PROGRESS,
                // Self-loop: clears the assignment so the seller picks another.
                ADMIN_DECLINED, WAITING_ADMIN,
                TIMEOUT, ORPHANED
        ));
        m.put(IN_PROGRESS, Map.of(
                ADMIN_CLOSED, WAITING_CLOSE_CONFIRM,
                ADMIN_CANCELLED, REJECTED
                // No TIMEOUT on purpose — see the class javadoc of
                // TradeEscalationSweeper. state_deadline stays NULL here.
        ));
        m.put(WAITING_CLOSE_CONFIRM, Map.of(
                CLOSE_CONFIRMED, SUCCESS,
                // Silence is consent: the admin certified all six steps.
                TIMEOUT, SUCCESS
        ));
        terminals(m);
        return m;
    }

    private static void terminals(Map<TradeState, Map<TradeEvent, TradeState>> m) {
        m.put(SUCCESS, Map.of());
        m.put(REJECTED, Map.of());
        m.put(ORPHANED, Map.of());
    }

    public TradeState transition(TradeMode mode, TradeState current, TradeEvent event) {
        Map<TradeEvent, TradeState> row = TABLES.get(mode).get(current);
        TradeState next = row == null ? null : row.get(event);
        if (next == null) {
            throw new InvalidTradeTransitionException(current, event);
        }
        return next;
    }

    /** Backwards-compatible overload — SMART is the historical behaviour. */
    public TradeState transition(TradeState current, TradeEvent event) {
        return transition(TradeMode.SMART, current, event);
    }
}
