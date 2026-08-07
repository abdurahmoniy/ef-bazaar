package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalDetailsResponse;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;
import uz.efbazaar.trade.trade.service.TradeProposalService;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeProposalServiceIT extends AbstractIntegrationIT {

    @Autowired TradeProposalService svc;
    @Autowired StringRedisTemplate redis;
    @Autowired uz.efbazaar.trade.trade.service.TradeService tradeService;
    @Autowired uz.efbazaar.trade.trade.repository.TradeChatRepository chats;

    @Test
    void createStoresRedisEntryWithTtl() {
        UUID proposer = UUID.randomUUID();
        UUID other = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                UUID.randomUUID(), other, proposer, other,
                500_000L, UUID.randomUUID(), null, TradeMode.SMART, null, null);
        ProposalResponse res = svc.create(proposer, req);

        String key = "trade:proposal:" + res.proposalId();
        assertThat(redis.opsForHash().entries(key)).isNotEmpty();
        Long ttl = redis.getExpire(key);
        assertThat(ttl).isPositive();
    }

    @Test
    void createAlsoWritesByChatIndex() {
        UUID proposer = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                chatId, other, proposer, other, 500_000L, UUID.randomUUID(), null,
                TradeMode.SMART, null, null);
        ProposalResponse res = svc.create(proposer, req);

        String indexKey = "trade:proposal:by-chat:" + chatId;
        assertThat(redis.opsForValue().get(indexKey)).isEqualTo(res.proposalId().toString());
        assertThat(redis.getExpire(indexKey)).isPositive();
    }

    @Test
    void findByChatReturnsProposalForBothParticipants() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                chatId, buyer, seller, buyer, 500_000L, UUID.randomUUID(), null,
                TradeMode.SMART, null, null);
        ProposalResponse res = svc.create(seller, req);

        Optional<ProposalDetailsResponse> sellerView = svc.findActiveProposalByChatId(chatId, seller);
        assertThat(sellerView).isPresent();
        assertThat(sellerView.get().proposalId()).isEqualTo(res.proposalId());
        assertThat(sellerView.get().sellerId()).isEqualTo(seller);
        assertThat(sellerView.get().buyerId()).isEqualTo(buyer);
        assertThat(sellerView.get().amountUzs()).isEqualTo(500_000L);

        Optional<ProposalDetailsResponse> buyerView = svc.findActiveProposalByChatId(chatId, buyer);
        assertThat(buyerView).isPresent();
        assertThat(buyerView.get().proposalId()).isEqualTo(res.proposalId());
    }

    @Test
    void findByChatReturnsEmptyForNonParticipant() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                chatId, buyer, seller, buyer, 500_000L, UUID.randomUUID(), null,
                TradeMode.SMART, null, null);
        svc.create(seller, req);

        assertThat(svc.findActiveProposalByChatId(chatId, stranger)).isEmpty();
    }

    @Test
    void findByChatReturnsEmptyWhenNoProposal() {
        assertThat(svc.findActiveProposalByChatId(UUID.randomUUID(), UUID.randomUUID())).isEmpty();
    }

    @Test
    void rejectRemovesEntryAndIndex() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                chatId, buyer, seller, buyer, 500_000L, UUID.randomUUID(), null,
                TradeMode.SMART, null, null);
        ProposalResponse res = svc.create(seller, req);

        svc.reject(buyer, res.proposalId());

        String mainKey = "trade:proposal:" + res.proposalId();
        String indexKey = "trade:proposal:by-chat:" + chatId;
        assertThat(redis.opsForHash().entries(mainKey)).isEmpty();
        assertThat(redis.opsForValue().get(indexKey)).isNull();
        assertThat(svc.findActiveProposalByChatId(chatId, seller)).isEmpty();
    }

    @Test
    void rejectRemovesEntryAndUnknownIdThrows() {
        UUID unknown = UUID.randomUUID();
        assertThatThrownBy(() -> svc.reject(UUID.randomUUID(), unknown))
                .isInstanceOf(ProposalNotFoundException.class);
    }

    @Test
    void acceptCreatesTradeAndTwoChats() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID sellerCard = UUID.randomUUID();
        UUID buyerCard = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                UUID.randomUUID(), buyer, seller, buyer, 500_000L,
                sellerCard, null, TradeMode.SMART, null, null);
        ProposalResponse pr = svc.create(seller, req);

        var trade = svc.accept(buyer, pr.proposalId(), buyerCard);
        assertThat(trade.state()).isEqualTo(uz.efbazaar.trade.trade.domain.TradeState.INITIATED);
        assertThat(chats.findByTradeId(trade.id())).hasSize(2);
    }

    @Test
    void acceptRemovesEntryAndIndex() {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();

        ProposalCreateRequest req = new ProposalCreateRequest(
                chatId, buyer, seller, buyer, 500_000L,
                UUID.randomUUID(), null, TradeMode.SMART, null, null);
        ProposalResponse pr = svc.create(seller, req);

        svc.accept(buyer, pr.proposalId(), UUID.randomUUID());

        String mainKey = "trade:proposal:" + pr.proposalId();
        String indexKey = "trade:proposal:by-chat:" + chatId;
        assertThat(redis.opsForHash().entries(mainKey)).isEmpty();
        assertThat(redis.opsForValue().get(indexKey)).isNull();
        assertThat(svc.findActiveProposalByChatId(chatId, seller)).isEmpty();
    }
}
