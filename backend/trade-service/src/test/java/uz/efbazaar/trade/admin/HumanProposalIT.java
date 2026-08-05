package uz.efbazaar.trade.admin;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeProposalService;

import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@SpringBootTest
class HumanProposalIT extends AbstractIntegrationIT {

    @Autowired TradeProposalService proposals;
    @Autowired TradeRepository trades;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired ObjectMapper json;

    private UUID hireableAdmin() {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        return id;
    }

    private ProposalCreateRequest human(UUID seller, UUID buyer, UUID admin, Long fee) {
        return new ProposalCreateRequest(UUID.randomUUID(), buyer, seller, buyer,
                80_000L, null, null, TradeMode.HUMAN, admin, fee);
    }

    @Test
    void sellerCanOpenAHumanTradeWithoutCards() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = hireableAdmin();

        var created = proposals.create(seller, human(seller, buyer, admin, 20_000L));
        var trade = proposals.accept(buyer, created.proposalId(), null);

        var row = trades.findById(trade.id()).orElseThrow();
        assertThat(row.getMode()).isEqualTo(TradeMode.HUMAN);
        assertThat(row.getAssignedAdminId()).isEqualTo(admin);
        assertThat(row.getAdminFeeUzs()).isEqualTo(20_000L);
        assertThat(row.getSellerCardId()).isNull();
        assertThat(row.getBuyerCardId()).isNull();

        // MockWorker + EmailProvisionedConsumer race to drive
        // INITIATED -> WAITING_ADMIN asynchronously (same race TradeE2EIT
        // awaits for the SMART path's INITIATED -> WAITING_PAYMENT).
        await().atMost(10, TimeUnit.SECONDS).until(() ->
                trades.findById(trade.id()).orElseThrow().getState() == TradeState.WAITING_ADMIN);
    }

    @Test
    void buyerCannotChooseHumanMode() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = hireableAdmin();

        // proposerUserId == buyer → HUMAN is refused (spec §3.11).
        assertThatThrownBy(() -> proposals.create(buyer, human(seller, buyer, admin, 20_000L)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void feeOutsideTheAdminsBandIsRefused() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = hireableAdmin();   // band is 15 000–40 000

        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, admin, 100_000L)))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, admin, 1_000L)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void humanProposalWithoutAnAdminIsRefused() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();

        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, null, 20_000L)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void adminCannotBeAPartyToTheirOwnTrade() {
        UUID seller = hireableAdmin();
        UUID buyer = UUID.randomUUID();

        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, seller, 20_000L)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void pausedAdminCannotBeHired() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(admin).minFeeUzs(15_000).maxFeeUzs(40_000)
                .acceptingOrders(false).build());

        assertThatThrownBy(() -> proposals.create(seller, human(seller, buyer, admin, 20_000L)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void smartProposalStillRequiresBothCards() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        var req = new ProposalCreateRequest(UUID.randomUUID(), buyer, seller, buyer,
                80_000L, UUID.randomUUID(), null, TradeMode.SMART, null, null);

        var created = proposals.create(seller, req);

        // Accepting without the accepter's card must fail for a smart trade.
        assertThatThrownBy(() -> proposals.accept(buyer, created.proposalId(), null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void pendingHumanProposalTellsTheBuyerWhichAdminAndFee() {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID();
        UUID admin = hireableAdmin();
        UUID chatId = UUID.randomUUID();
        var req = new ProposalCreateRequest(chatId, buyer, seller, buyer,
                80_000L, null, null, TradeMode.HUMAN, admin, 20_000L);
        proposals.create(seller, req);

        var found = proposals.findActiveProposalByChatId(chatId, buyer).orElseThrow();

        assertThat(found.mode()).isEqualTo(TradeMode.HUMAN);
        assertThat(found.adminId()).isEqualTo(admin);
        assertThat(found.adminFeeUzs()).isEqualTo(20_000L);
    }
}
