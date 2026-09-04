package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeMode;
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
    void provisionFailureEndsTheTradeInsteadOfStrandingIt() {
        // INITIATED yagona chiqishsiz holat edi: deadline yo'q, TIMEOUT
        // yo'q, rad etish ham yo'q. Worker uch urinishdan keyin taslim
        // bo'lardi va savdo xaridorning puli muzlatilgan holda abadiy
        // qotib qolardi — uni faqat bazaga kirib ochish mumkin edi.
        assertThat(sm.transition(INITIATED, PROVISION_FAILED)).isEqualTo(ORPHANED);
        assertThat(sm.transition(TradeMode.HUMAN, INITIATED, PROVISION_FAILED))
                .isEqualTo(ORPHANED);
    }

    @Test
    void provisionFailureIsOnlyAcceptedWhileTheMailboxIsStillPending() {
        // Kechikkan yoki takroriy xabar ishlab turgan savdoni yopib
        // yubormasin: quti allaqachon ochilgan bo'lishi mumkin.
        assertThatThrownBy(() -> sm.transition(WAITING_PAYMENT, PROVISION_FAILED))
                .isInstanceOf(InvalidTradeTransitionException.class);
        assertThatThrownBy(() -> sm.transition(WAITING_BUYER_VERIFY, PROVISION_FAILED))
                .isInstanceOf(InvalidTradeTransitionException.class);
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

    // ----- human path -----

    @Test
    void humanPathReachesSuccess() {
        TradeState s = INITIATED;
        s = sm.transition(TradeMode.HUMAN, s, MAILBOX_PROVISIONED);
        assertThat(s).isEqualTo(WAITING_ADMIN);
        s = sm.transition(TradeMode.HUMAN, s, ADMIN_ACCEPTED);
        assertThat(s).isEqualTo(IN_PROGRESS);
        s = sm.transition(TradeMode.HUMAN, s, ADMIN_CLOSED);
        assertThat(s).isEqualTo(WAITING_CLOSE_CONFIRM);
        s = sm.transition(TradeMode.HUMAN, s, CLOSE_CONFIRMED);
        assertThat(s).isEqualTo(SUCCESS);
    }

    @Test
    void humanMailboxProvisionedGoesToWaitingAdminNotWaitingPayment() {
        assertThat(sm.transition(TradeMode.HUMAN, INITIATED, MAILBOX_PROVISIONED))
                .isEqualTo(WAITING_ADMIN);
        assertThat(sm.transition(TradeMode.SMART, INITIATED, MAILBOX_PROVISIONED))
                .isEqualTo(WAITING_PAYMENT);
    }

    @Test
    void declineIsASelfLoopSoTheSellerCanTryAnotherAdmin() {
        assertThat(sm.transition(TradeMode.HUMAN, WAITING_ADMIN, ADMIN_DECLINED))
                .isEqualTo(WAITING_ADMIN);
    }

    @Test
    void nobodyAcceptingOrphansTheTrade() {
        assertThat(sm.transition(TradeMode.HUMAN, WAITING_ADMIN, TIMEOUT))
                .isEqualTo(ORPHANED);
    }

    @Test
    void closeConfirmTimeoutSucceedsRatherThanRejects() {
        // Spec §3.8: the admin certified all six steps, so silence is consent.
        assertThat(sm.transition(TradeMode.HUMAN, WAITING_CLOSE_CONFIRM, TIMEOUT))
                .isEqualTo(SUCCESS);
    }

    @Test
    void adminCanCancelAFakeAccount() {
        assertThat(sm.transition(TradeMode.HUMAN, IN_PROGRESS, ADMIN_CANCELLED))
                .isEqualTo(REJECTED);
    }

    @Test
    void inProgressHasNoTimeoutTransition() {
        // If it had one, and IN_PROGRESS carried a state_deadline, the sweeper
        // would fire every 10s forever. Escalation uses its own column instead.
        assertThatThrownBy(() -> sm.transition(TradeMode.HUMAN, IN_PROGRESS, TIMEOUT))
                .isInstanceOf(InvalidTradeTransitionException.class);
    }

    // ----- the two paths cannot cross -----

    @Test
    void humanTradeCannotEnterTheSmartPath() {
        for (TradeEvent e : TradeEvent.values()) {
            assertThatThrownBy(() -> sm.transition(TradeMode.HUMAN, WAITING_PAYMENT, e))
                    .isInstanceOf(InvalidTradeTransitionException.class);
        }
    }

    @Test
    void smartTradeCannotEnterTheHumanPath() {
        for (TradeState s : new TradeState[]{WAITING_ADMIN, IN_PROGRESS, WAITING_CLOSE_CONFIRM}) {
            for (TradeEvent e : TradeEvent.values()) {
                assertThatThrownBy(() -> sm.transition(TradeMode.SMART, s, e))
                        .isInstanceOf(InvalidTradeTransitionException.class);
            }
        }
    }

    @Test
    void twoArgOverloadStillMeansSmart() {
        assertThat(sm.transition(INITIATED, MAILBOX_PROVISIONED))
                .isEqualTo(WAITING_PAYMENT);
    }
}
