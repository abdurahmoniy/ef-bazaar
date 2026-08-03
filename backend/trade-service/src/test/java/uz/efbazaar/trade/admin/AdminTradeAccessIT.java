package uz.efbazaar.trade.admin;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.domain.TradeViewer;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class AdminTradeAccessIT extends AbstractIntegrationIT {

    @Autowired TradeRepository trades;
    @Autowired TradeService tradeService;

    private Trade persistHumanTrade(UUID seller, UUID buyer, UUID admin) {
        return trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(seller)
                .buyerId(buyer)
                .priceUzs(80_000)
                .state(TradeState.IN_PROGRESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .adminFeeUzs(15_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void assignedAdminCanReadTheTrade() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        Trade loaded = tradeService.getForViewer(t.getId(), admin);

        assertThat(loaded.getId()).isEqualTo(t.getId());
        assertThat(loaded.viewerFor(admin)).isEqualTo(TradeViewer.ADMIN);
    }

    @Test
    void unassignedAdminGetsNotFoundNotForbidden() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);
        UUID otherAdmin = UUID.randomUUID();

        assertThatThrownBy(() -> tradeService.getForViewer(t.getId(), otherAdmin))
                .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void partyOnlyPathStillExcludesTheAdmin() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        // get() keeps its party-only meaning — close-confirm depends on it.
        assertThatThrownBy(() -> tradeService.get(t.getId(), admin))
                .isInstanceOf(EntityNotFoundException.class);
        assertThat(tradeService.get(t.getId(), seller).getId()).isEqualTo(t.getId());
    }

    @Test
    void humanTradeCanBePersistedWithoutCards() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = persistHumanTrade(seller, buyer, admin);

        assertThat(t.getSellerCardId()).isNull();
        assertThat(t.getBuyerCardId()).isNull();
    }
}
