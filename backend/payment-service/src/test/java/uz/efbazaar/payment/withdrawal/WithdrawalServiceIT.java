package uz.efbazaar.payment.withdrawal;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;
import uz.efbazaar.payment.withdrawal.domain.WithdrawalStatus;
import uz.efbazaar.payment.withdrawal.domain.WithdrawalTicket;
import uz.efbazaar.payment.withdrawal.service.WithdrawalService;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Withdrawals against a real PostgreSQL, because the guarantee being tested is
 * a database one: the money is frozen the instant the ticket exists, and the
 * two can never disagree.
 */
@SpringBootTest
class WithdrawalServiceIT extends AbstractPostgresIT {

    private static final String PAN = "8600 1234 5678 9010";

    @Autowired WithdrawalService withdrawals;
    @Autowired LedgerService ledger;

    private UUID fundedUser(long tiyin) {
        UUID user = UUID.randomUUID();
        ledger.post(TransactionKind.DEPOSIT, "seed-" + UUID.randomUUID(), null, null,
                List.of(new Posting(LedgerAccount.PLATFORM_CARDS, null, tiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, user, -tiyin)));
        return user;
    }

    private WithdrawalTicket open(UUID user, long tiyin) {
        return withdrawals.open(user, tiyin, PAN, "ali valiyev", "+998901234567", "ali");
    }

    @Test
    void openingATicketFreezesTheMoneyImmediately() {
        UUID user = fundedUser(10_000_000L);      // 100 000 so'm

        open(user, 5_000_000L);

        var w = ledger.balanceOf(user);
        assertThat(w.getAvailableTiyin()).isEqualTo(5_000_000L);
        assertThat(w.getWithdrawPendingTiyin())
                .as("frozen the moment the ticket exists, not when the admin pays")
                .isEqualTo(5_000_000L);
    }

    @Test
    void frozenMoneyCannotBeSpentWhileTheTicketWaits() {
        // The whole reason the reserve happens on open. If it waited for the
        // close, this second withdrawal would be allowed and the admin would
        // end up paying twice out of one balance.
        UUID user = fundedUser(10_000_000L);
        open(user, 10_000_000L);
        withdrawals.markPaid(withdrawals.queue().get(0).getId(), UUID.randomUUID(), null);

        assertThatThrownBy(() -> open(user, 10_000_000L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void payingOutTakesTheMoneyOffThePlatform() {
        UUID user = fundedUser(10_000_000L);
        WithdrawalTicket t = open(user, 4_000_000L);

        withdrawals.markPaid(t.getId(), UUID.randomUUID(), "Humo orqali yuborildi");

        var w = ledger.balanceOf(user);
        assertThat(w.getWithdrawPendingTiyin()).as("payout completed").isZero();
        assertThat(w.getAvailableTiyin()).as("not returned — it was paid out")
                .isEqualTo(6_000_000L);
    }

    @Test
    void rejectingGivesTheMoneyBack() {
        UUID user = fundedUser(10_000_000L);
        WithdrawalTicket t = open(user, 4_000_000L);

        withdrawals.reject(t.getId(), UUID.randomUUID(), "Karta egasi mos emas");

        var w = ledger.balanceOf(user);
        assertThat(w.getWithdrawPendingTiyin()).isZero();
        assertThat(w.getAvailableTiyin()).as("nothing lost on a payout that did not happen")
                .isEqualTo(10_000_000L);
    }

    @Test
    void aTicketCannotBeClosedTwice() {
        // Two admins working the queue at once must not post two movements.
        UUID user = fundedUser(10_000_000L);
        WithdrawalTicket t = open(user, 4_000_000L);
        withdrawals.markPaid(t.getId(), UUID.randomUUID(), null);

        assertThatThrownBy(() -> withdrawals.markPaid(t.getId(), UUID.randomUUID(), null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");

        assertThat(ledger.balanceOf(user).getAvailableTiyin())
                .as("the second close moved nothing").isEqualTo(6_000_000L);
    }

    @Test
    void aPaidTicketCannotThenBeRejectedIntoARefund() {
        // The dangerous direction: money already sent, then refunded as well.
        UUID user = fundedUser(10_000_000L);
        WithdrawalTicket t = open(user, 4_000_000L);
        withdrawals.markPaid(t.getId(), UUID.randomUUID(), null);

        assertThatThrownBy(() -> withdrawals.reject(t.getId(), UUID.randomUUID(), null))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(6_000_000L);
    }

    @Test
    void askingForMoreThanTheWalletHoldsIsRefusedAndNothingMoves() {
        UUID user = fundedUser(3_000_000L);

        assertThatThrownBy(() -> open(user, 5_000_000L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");

        var w = ledger.balanceOf(user);
        assertThat(w.getAvailableTiyin()).isEqualTo(3_000_000L);
        assertThat(w.getWithdrawPendingTiyin()).isZero();
    }

    @Test
    void onlyOneTicketMayBeOpenAtATime() {
        UUID user = fundedUser(20_000_000L);
        open(user, 5_000_000L);

        assertThatThrownBy(() -> open(user, 5_000_000L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void theHolderNameIsStoredUppercase() {
        // chk_wt_holder enforces it in the database, so a lowercase write
        // would fail the insert rather than quietly store the wrong thing.
        UUID user = fundedUser(10_000_000L);

        assertThat(open(user, 4_000_000L).getHolderName()).isEqualTo("ALI VALIYEV");
    }

    @Test
    void theCardComesBackWhole() {
        UUID user = fundedUser(10_000_000L);
        WithdrawalTicket t = open(user, 4_000_000L);

        assertThat(withdrawals.revealPan(t.getId()))
                .as("the admin sends money to this number, so spacing must not survive")
                .isEqualTo("8600123456789010");
        assertThat(t.getLast4()).isEqualTo("9010");
    }

    @Test
    void aTinyPayoutIsRefused() {
        UUID user = fundedUser(10_000_000L);

        assertThatThrownBy(() -> open(user, 100L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void moneyIsNeverCreatedOrDestroyed() {
        UUID user = fundedUser(10_000_000L);
        WithdrawalTicket t = open(user, 4_000_000L);
        withdrawals.markPaid(t.getId(), UUID.randomUUID(), null);

        var w = ledger.balanceOf(user);
        assertThat(w.getAvailableTiyin() + w.getHeldTiyin() + w.getWithdrawPendingTiyin()
                        + 4_000_000L)
                .as("what is left plus what was paid out is what went in")
                .isEqualTo(10_000_000L);
    }
}
