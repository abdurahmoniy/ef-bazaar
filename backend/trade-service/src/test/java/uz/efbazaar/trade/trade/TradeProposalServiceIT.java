package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;
import uz.efbazaar.trade.trade.service.TradeProposalService;

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
                500_000L, UUID.randomUUID(), null);
        ProposalResponse res = svc.create(proposer, req);

        String key = "trade:proposal:" + res.proposalId();
        assertThat(redis.opsForHash().entries(key)).isNotEmpty();
        Long ttl = redis.getExpire(key);
        assertThat(ttl).isPositive();
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
                sellerCard, null);
        ProposalResponse pr = svc.create(seller, req);

        var trade = svc.accept(buyer, pr.proposalId(), buyerCard);
        assertThat(trade.state()).isEqualTo(uz.efbazaar.trade.trade.domain.TradeState.INITIATED);
        assertThat(chats.findByTradeId(trade.id())).hasSize(2);
    }
}
