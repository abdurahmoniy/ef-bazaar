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
}
