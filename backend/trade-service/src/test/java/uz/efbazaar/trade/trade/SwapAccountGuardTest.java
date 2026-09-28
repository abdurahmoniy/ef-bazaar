package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.marketplace.AccountSummaryClient;
import uz.efbazaar.trade.trade.domain.GiveAccountSnapshot;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.SwapAccountGuard;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class SwapAccountGuardTest {

    private final AccountSummaryClient client = mock(AccountSummaryClient.class);
    private final TradeRepository trades = mock(TradeRepository.class);
    private final SwapAccountGuard guard = new SwapAccountGuard(client, trades);
    private final UUID buyer = UUID.randomUUID();
    private final UUID account = UUID.randomUUID();

    private void account(UUID owner, String status, UUID listing) {
        when(client.fetch(account)).thenReturn(new AccountSummaryClient.AccountSummary(
                account, owner, status, "Asosiy akk", "m-1", "Kuchli", 3250, listing));
    }

    private static int status(Throwable e) {
        return ((ResponseStatusException) e).getStatusCode().value();
    }

    @Test
    void noAccountMeansOtherAndSkipsMarketplace() {
        assertThat(guard.check(null, buyer, TradeKind.SWAP)).isNull();
        verifyNoInteractions(client, trades);
    }

    @Test
    void aSaleCannotCarryAnAccount() {
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SALE))
                .satisfies(e -> assertThat(status(e)).isEqualTo(400));
        verifyNoInteractions(client);
    }

    @Test
    void returnsTheSnapshotOfAFreeOwnAccount() {
        account(buyer, "ACTIVE", null);
        assertThat(guard.check(account, buyer, TradeKind.SWAP_SURCHARGE))
                .isEqualTo(new GiveAccountSnapshot(account, "Asosiy akk", "m-1", "Kuchli", 3250));
    }

    @Test
    void someoneElsesAccountIsRefused() {
        account(UUID.randomUUID(), "ACTIVE", null);
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(400));
    }

    @Test
    void anArchivedAccountIsRefused() {
        account(buyer, "ARCHIVED", null);
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(400));
    }

    @Test
    void anAccountAlreadyGivenInALiveTradeIsBusy() {
        account(buyer, "ACTIVE", null);
        when(trades.existsLiveWithGiveAccount(eq(account), any())).thenReturn(true);
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(409));
    }

    @Test
    void anAccountWhoseListingIsBeingSoldIsBusy() {
        UUID listing = UUID.randomUUID();
        account(buyer, "ACTIVE", listing);
        when(trades.existsLiveWithListing(eq(listing), any())).thenReturn(true);
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(409));
    }

    @Test
    void aListedButIdleAccountIsAllowed() {
        UUID listing = UUID.randomUUID();
        account(buyer, "ACTIVE", listing);
        assertThat(guard.check(account, buyer, TradeKind.SWAP)).isNotNull();
    }

    @Test
    void marketplaceOutageBlocksTheTrade() {
        when(client.fetch(account)).thenThrow(new ResponseStatusException(HttpStatus.BAD_GATEWAY, "down"));
        assertThatThrownBy(() -> guard.check(account, buyer, TradeKind.SWAP))
                .satisfies(e -> assertThat(status(e)).isEqualTo(502));
    }
}
