package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.testsupport.StubEscrowConfig;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Import(StubEscrowConfig.class)
class GiveAccountPersistenceIT extends AbstractIntegrationIT {

    @Autowired TradeService trades;
    @Autowired TradeRepository tradeRepo;

    private UUID openSwap(UUID buyer) {
        return trades.openTrade(UUID.randomUUID(), UUID.randomUUID(), buyer, 0L,
                null, null, UUID.randomUUID(), null, TradeMode.SMART, null, null,
                TradeKind.SWAP, 500_000L).id();
    }

    @Test
    void theSnapshotIsStoredAndReturnedToBothSides() {
        UUID buyer = UUID.randomUUID();
        UUID tradeId = openSwap(buyer);
        UUID account = UUID.randomUUID();
        var snapshot = new GiveAccountSnapshot(account, "Asosiy akk", "m-1", "Kuchli akkount", 3250);

        var response = trades.attachGiveAccount(tradeId, snapshot, ParticipantRole.BUYER);

        assertThat(response.giveAccount()).isEqualTo(snapshot);
        Trade saved = tradeRepo.findById(tradeId).orElseThrow();
        assertThat(saved.getGiveAccountId()).isEqualTo(account);
        assertThat(trades.toResponse(saved, ParticipantRole.SELLER).giveAccount()).isEqualTo(snapshot);
        assertThat(tradeRepo.existsLiveWithGiveAccount(account, TradeState.nonTerminal())).isTrue();
        assertThat(tradeRepo.findGiveAccountIdsOfBuyer(buyer, TradeState.nonTerminal())).containsExactly(account);
    }

    @Test
    void aTradeWithoutAChosenAccountHasNoSnapshot() {
        UUID tradeId = openSwap(UUID.randomUUID());
        Trade saved = tradeRepo.findById(tradeId).orElseThrow();
        assertThat(trades.toResponse(saved, ParticipantRole.SELLER).giveAccount()).isNull();
    }

    @Test
    void oneAccountCannotBeGivenInTwoLiveTrades() {
        UUID account = UUID.randomUUID();
        var snapshot = new GiveAccountSnapshot(account, null, null, "", null);
        trades.attachGiveAccount(openSwap(UUID.randomUUID()), snapshot, ParticipantRole.BUYER);
        UUID second = openSwap(UUID.randomUUID());

        assertThatThrownBy(() -> trades.attachGiveAccount(second, snapshot, ParticipantRole.BUYER))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void aLiveTradeOnTheListingIsDetected() {
        UUID listing = UUID.randomUUID();
        trades.openTrade(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 0L,
                null, null, listing, null, TradeMode.SMART, null, null, TradeKind.SWAP, 500_000L);
        assertThat(tradeRepo.existsLiveWithListing(listing, TradeState.nonTerminal())).isTrue();
        assertThat(tradeRepo.existsLiveWithListing(UUID.randomUUID(), TradeState.nonTerminal())).isFalse();
    }
}
