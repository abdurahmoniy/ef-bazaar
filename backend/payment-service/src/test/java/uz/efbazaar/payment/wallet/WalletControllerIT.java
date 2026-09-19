package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.payment.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * The wallet endpoints are the only place "a caller sees only their own
 * money" is enforced end to end -- {@link LedgerService} itself is scoped by
 * whatever userId it is handed, so the guarantee lives in the controller
 * reading identity from {@code X-User-Id} and nowhere else.
 */
@SpringBootTest
@AutoConfigureMockMvc
class WalletControllerIT extends AbstractPostgresIT {

    @Autowired MockMvc mvc;
    @Autowired LedgerService ledger;

    @Test
    void aCallerSeesOnlyTheirOwnWalletAndHistory() throws Exception {
        UUID userA = UUID.randomUUID();
        UUID userB = UUID.randomUUID();

        ledger.post(TransactionKind.DEPOSIT, "http-a-" + userA, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 70_000),
                new Posting(LedgerAccount.USER_AVAILABLE, userA, -70_000)));
        ledger.post(TransactionKind.DEPOSIT, "http-b-" + userB, null, null, List.of(
                new Posting(LedgerAccount.PLATFORM_CARDS, null, 999_000),
                new Posting(LedgerAccount.USER_AVAILABLE, userB, -999_000)));

        mvc.perform(get("/api/v1/payments/wallet").with(asUser(userA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availableTiyin").value(70_000))
                .andExpect(jsonPath("$.lifetimeDepositedTiyin").value(70_000));

        mvc.perform(get("/api/v1/payments/wallet/transactions").with(asUser(userA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].kind").value("DEPOSIT"))
                .andExpect(jsonPath("$[0].account").value("USER_AVAILABLE"))
                .andExpect(jsonPath("$[0].amountTiyin").value(-70_000))
                .andExpect(jsonPath("$[*].amountTiyin", not(hasItem(-999_000))));
    }

    @Test
    void tradeLinksAreProjectedOnlyForTheCallersOwnEntries() throws Exception {
        UUID userA = UUID.randomUUID();
        UUID userB = UUID.randomUUID();
        UUID tradeA = UUID.randomUUID();
        UUID tradeB = UUID.randomUUID();
        for (UUID user : List.of(userA, userB)) {
            ledger.post(TransactionKind.DEPOSIT, "trade-link-deposit-" + user, null, null, List.of(
                    new Posting(LedgerAccount.PLATFORM_CARDS, null, 100_000),
                    new Posting(LedgerAccount.USER_AVAILABLE, user, -100_000)));
        }
        ledger.post(TransactionKind.TRADE_HOLD, "trade-hold-" + tradeA, null, "private note", List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, userA, 50_000),
                new Posting(LedgerAccount.USER_HELD, userA, -50_000)));
        ledger.post(TransactionKind.TRADE_HOLD, "trade-hold-" + tradeB, null, "other private note", List.of(
                new Posting(LedgerAccount.USER_AVAILABLE, userB, 50_000),
                new Posting(LedgerAccount.USER_HELD, userB, -50_000)));

        mvc.perform(get("/api/v1/payments/wallet/transactions").with(asUser(userA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[*].tradeId", hasItem(tradeA.toString())))
                .andExpect(jsonPath("$[*].tradeId", not(hasItem(tradeB.toString()))))
                .andExpect(jsonPath("$[*].idempotencyKey").doesNotExist())
                .andExpect(jsonPath("$[*].note").doesNotExist());
    }

    @Test
    void anUnauthenticatedRequestIsRejected() throws Exception {
        mvc.perform(get("/api/v1/payments/wallet"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/payments/wallet/transactions"))
                .andExpect(status().isUnauthorized());
    }
}
