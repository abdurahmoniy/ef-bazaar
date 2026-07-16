package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Trade proposals are ephemeral (10-minute TTL). They live in Redis rather
 * than Postgres so expiry is free and there's no need for a scheduled purge.
 *
 * <p>Redis representation: hash key {@code trade:proposal:{proposalId}} with
 * fields:
 * <pre>
 *   marketplaceChatId
 *   proposerUserId
 *   sellerId
 *   buyerId
 *   amountUzs
 *   listingId          (may be blank)
 *   proposerCardId
 * </pre>
 * TTL 600s. On {@link #accept}, the proposal is deleted after a Trade row is
 * created; on {@link #reject}, it's deleted immediately. Redis TTL handles the
 * EXPIRED case — a background sweep publishes {@code proposal-resolved(EXPIRED)}
 * shortly after (Task 18 timeout scheduler).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeProposalService {

    private final StringRedisTemplate redis;
    private final TradeEventPublisher events;
    private final TradeService trades;
    private final TradeAuditService audit;

    @Value("${trade.proposal.ttl-seconds:600}")
    private long ttlSeconds;

    public ProposalResponse create(UUID proposerUserId, ProposalCreateRequest req) {
        UUID proposalId = UUID.randomUUID();
        String key = redisKey(proposalId);

        Map<String, String> hash = Map.of(
                "marketplaceChatId", req.marketplaceChatId().toString(),
                "proposerUserId",    proposerUserId.toString(),
                "sellerId",          req.sellerId().toString(),
                "buyerId",           req.buyerId().toString(),
                "amountUzs",         req.amountUzs().toString(),
                "listingId",         req.listingId() != null ? req.listingId().toString() : "",
                "proposerCardId",    req.cardId().toString()
        );
        redis.opsForHash().putAll(key, hash);
        redis.expire(key, Duration.ofSeconds(ttlSeconds));

        events.proposalCreated(proposalId, req.marketplaceChatId(),
                proposerUserId, req.amountUzs());

        return new ProposalResponse(proposalId,
                Instant.now().plusSeconds(ttlSeconds));
    }

    @Transactional
    public TradeResponse accept(UUID accepterUserId, UUID proposalId, UUID accepterCardId) {
        Map<Object, Object> raw = redis.opsForHash().entries(redisKey(proposalId));
        if (raw.isEmpty()) {
            throw new ProposalNotFoundException(proposalId.toString());
        }

        UUID proposerUserId = UUID.fromString((String) raw.get("proposerUserId"));
        UUID sellerId       = UUID.fromString((String) raw.get("sellerId"));
        UUID buyerId        = UUID.fromString((String) raw.get("buyerId"));
        long amountUzs      = Long.parseLong((String) raw.get("amountUzs"));
        UUID proposerCard   = UUID.fromString((String) raw.get("proposerCardId"));

        // The accepter must be the OTHER party — a proposer accepting their own proposal is nonsense.
        if (accepterUserId.equals(proposerUserId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Proposer cannot accept own proposal");
        }

        // Which card belongs to which side?
        UUID sellerCardId = sellerId.equals(proposerUserId) ? proposerCard : accepterCardId;
        UUID buyerCardId  = buyerId.equals(proposerUserId)  ? proposerCard : accepterCardId;

        UUID listingId = optionalUuid(raw.get("listingId"));
        UUID chatId    = optionalUuid(raw.get("marketplaceChatId"));

        var trade = trades.openTrade(sellerId, buyerId, amountUzs,
                sellerCardId, buyerCardId, listingId, chatId);

        redis.delete(redisKey(proposalId));
        events.proposalResolved(proposalId, TradeEvents.ProposalOutcome.ACCEPTED);
        audit.record(trade.id(), ActorType.USER, accepterUserId, "PROPOSAL_ACCEPTED",
                Map.of("proposalId", proposalId.toString()));
        return trade;
    }

    public void reject(UUID rejecterUserId, UUID proposalId) {
        if (Boolean.FALSE.equals(redis.delete(redisKey(proposalId)))) {
            throw new ProposalNotFoundException(proposalId.toString());
        }
        events.proposalResolved(proposalId, TradeEvents.ProposalOutcome.REJECTED);
    }

    private static UUID optionalUuid(Object v) {
        if (v == null) return null;
        String s = v.toString();
        return s.isBlank() ? null : UUID.fromString(s);
    }

    private static String redisKey(UUID proposalId) {
        return "trade:proposal:" + proposalId;
    }
}
