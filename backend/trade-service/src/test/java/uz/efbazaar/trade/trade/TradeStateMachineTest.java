package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.service.TradeStateMachine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static uz.efbazaar.trade.trade.domain.TradeEvent.*;
import static uz.efbazaar.trade.trade.domain.TradeState.*;

class TradeStateMachineTest {

    private final TradeStateMachine sm = new TradeStateMachine();

    @Test
    void happyPathReachesSuccess() {
        TradeState s = INITIATED;
        s = sm.transition(s, MAILBOX_PROVISIONED);
        assertThat(s).isEqualTo(WAITING_PAYMENT);
        s = sm.transition(s, PAYMENT_CONFIRMED);
        assertThat(s).isEqualTo(WAITING_EMAIL_CHANGE);
        s = sm.transition(s, EMAIL_CHANGED);
        assertThat(s).isEqualTo(VERIFYING_KONAMI_LINK);
        s = sm.transition(s, KONAMI_EMAIL_RECEIVED);
        assertThat(s).isEqualTo(WAITING_PASSWORD);
        s = sm.transition(s, PASSWORD_SENT);
        assertThat(s).isEqualTo(WAITING_BUYER_VERIFY);
        s = sm.transition(s, BUYER_CONFIRM);
        assertThat(s).isEqualTo(SUCCESS);
    }

    @Test
    void buyerRejectFromWaitingBuyerVerifyGoesToRejected() {
        TradeState s = sm.transition(WAITING_BUYER_VERIFY, BUYER_REJECT);
        assertThat(s).isEqualTo(REJECTED);
    }

    @Test
    void timeoutBeforeBuyerVerifyGoesOrphaned() {
        assertThat(sm.transition(WAITING_PAYMENT, TIMEOUT)).isEqualTo(ORPHANED);
        assertThat(sm.transition(WAITING_EMAIL_CHANGE, TIMEOUT)).isEqualTo(ORPHANED);
        assertThat(sm.transition(VERIFYING_KONAMI_LINK, TIMEOUT)).isEqualTo(ORPHANED);
        assertThat(sm.transition(WAITING_PASSWORD, TIMEOUT)).isEqualTo(ORPHANED);
    }

    @Test
    void timeoutOfBuyerVerifyGoesRejected() {
        // Spec §3.2 row 6: on timeout the trade goes REJECTED (buyer had 24h to confirm).
        assertThat(sm.transition(WAITING_BUYER_VERIFY, TIMEOUT)).isEqualTo(REJECTED);
    }

    @Test
    void recheckDoesNotChangeState() {
        assertThat(sm.transition(VERIFYING_KONAMI_LINK, RECHECK))
                .isEqualTo(VERIFYING_KONAMI_LINK);
    }

    @Test
    void terminalStatesAcceptNoEvents() {
        for (TradeState t : new TradeState[]{SUCCESS, REJECTED, ORPHANED}) {
            for (TradeEvent e : TradeEvent.values()) {
                assertThatThrownBy(() -> sm.transition(t, e))
                        .isInstanceOf(InvalidTradeTransitionException.class);
            }
        }
    }

    @Test
    void illegalTransitionThrows() {
        // Buyer can't reject before state 6.
        assertThatThrownBy(() -> sm.transition(WAITING_PAYMENT, BUYER_REJECT))
                .isInstanceOf(InvalidTradeTransitionException.class);
        // Password can't be sent before state 5.
        assertThatThrownBy(() -> sm.transition(WAITING_PAYMENT, PASSWORD_SENT))
                .isInstanceOf(InvalidTradeTransitionException.class);
        // Konami email can't arrive before state 4.
        assertThatThrownBy(() -> sm.transition(INITIATED, KONAMI_EMAIL_RECEIVED))
                .isInstanceOf(InvalidTradeTransitionException.class);
    }
}
