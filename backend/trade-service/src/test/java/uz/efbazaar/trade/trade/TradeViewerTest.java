package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeViewer;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TradeViewerTest {

    private final UUID seller = UUID.randomUUID();
    private final UUID buyer  = UUID.randomUUID();
    private final UUID admin  = UUID.randomUUID();

    private Trade humanTrade() {
        return Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(seller)
                .buyerId(buyer)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .build();
    }

    @Test
    void partiesResolveToTheirOwnSide() {
        Trade t = humanTrade();
        assertThat(t.viewerFor(seller)).isEqualTo(TradeViewer.SELLER);
        assertThat(t.viewerFor(buyer)).isEqualTo(TradeViewer.BUYER);
    }

    @Test
    void assignedAdminResolvesToAdmin() {
        assertThat(humanTrade().viewerFor(admin)).isEqualTo(TradeViewer.ADMIN);
    }

    @Test
    void strangerIsRejected() {
        UUID stranger = UUID.randomUUID();
        assertThatThrownBy(() -> humanTrade().viewerFor(stranger))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(humanTrade().isViewer(stranger)).isFalse();
    }

    @Test
    void smartTradeHasNoAdminViewer() {
        Trade smart = Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(seller)
                .buyerId(buyer)
                .mode(TradeMode.SMART)
                .build();
        assertThatThrownBy(() -> smart.viewerFor(admin))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void isViewerAcceptsAllThree() {
        Trade t = humanTrade();
        assertThat(t.isViewer(seller)).isTrue();
        assertThat(t.isViewer(buyer)).isTrue();
        assertThat(t.isViewer(admin)).isTrue();
    }
}
