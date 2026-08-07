package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.service.TradeAdminProfileService;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalDetailsResponse;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.exception.ProposalNotFoundException;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

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
 *   proposerCardId     (may be blank — HUMAN trades carry no card)
 *   mode
 *   adminId            (may be blank)
 *   adminFeeUzs        (may be blank)
 * </pre>
 * TTL 600s. A secondary index {@code trade:proposal:by-chat:{chatId} -> proposalId}
 * is written with the same TTL so both parties can look up the active proposal
 * for their chat after a page refresh (proposals only live in Redis, so with
 * no index the buyer's browser has nothing to fetch). If accept/reject miss
 * the index delete for any reason, the TTL cleans it up. On {@link #accept},
 * the proposal is deleted after a Trade row is created; on {@link #reject},
 * it's deleted immediately. Redis TTL handles the EXPIRED case — a background
 * sweep publishes {@code proposal-resolved(EXPIRED)} shortly after (Task 18
 * timeout scheduler).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeProposalService {

    private final StringRedisTemplate redis;
    private final TradeEventPublisher events;
    private final TradeService trades;
    private final TradeAuditService audit;
    private final TradeAdminProfileService adminProfiles;

    @Value("${trade.proposal.ttl-seconds:600}")
    private long ttlSeconds;

    public ProposalResponse create(UUID proposerUserId, ProposalCreateRequest req) {
        TradeMode mode = req.modeOrDefault();

        if (mode == TradeMode.HUMAN) {
            // Only the seller may hire — the fee comes out of their share.
            if (!proposerUserId.equals(req.sellerId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Inson adminni faqat sotuvchi tanlashi mumkin");
            }
            if (req.adminId() == null || req.adminFeeUzs() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Inson admin savdosida admin va haq ko'rsatilishi shart");
            }
            if (req.adminId().equals(req.sellerId()) || req.adminId().equals(req.buyerId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Admin o'z savdosining tarafi bo'lolmaydi");
            }
            // Throws 400 when the admin is unknown, inactive, paused, or the
            // fee sits outside their advertised band.
            adminProfiles.requireHireable(req.adminId(), req.adminFeeUzs());
        } else if (req.cardId() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Smart savdo uchun karta tanlanishi kerak");
        }

        UUID proposalId = UUID.randomUUID();
        String key = redisKey(proposalId);

        // LinkedHashMap, not Map.of: ten pairs is Map.of's ceiling and this
        // hash is already there.
        Map<String, String> hash = new LinkedHashMap<>();
        hash.put("marketplaceChatId", req.marketplaceChatId().toString());
        hash.put("proposerUserId",    proposerUserId.toString());
        hash.put("sellerId",          req.sellerId().toString());
        hash.put("buyerId",           req.buyerId().toString());
        hash.put("amountUzs",         req.amountUzs().toString());
        hash.put("listingId",         req.listingId() != null ? req.listingId().toString() : "");
        hash.put("proposerCardId",    req.cardId() != null ? req.cardId().toString() : "");
        hash.put("mode",              mode.name());
        hash.put("adminId",           req.adminId() != null ? req.adminId().toString() : "");
        hash.put("adminFeeUzs",       req.adminFeeUzs() != null ? req.adminFeeUzs().toString() : "");

        redis.opsForHash().putAll(key, hash);
        redis.expire(key, Duration.ofSeconds(ttlSeconds));

        // Secondary index by chatId so the counterparty can find the pending
        // proposal on refresh. Same TTL as the main key so both expire together.
        String indexKey = chatIndexKey(req.marketplaceChatId());
        redis.opsForValue().set(indexKey, proposalId.toString(), Duration.ofSeconds(ttlSeconds));

        events.proposalCreated(proposalId, req.marketplaceChatId(),
                proposerUserId, req.amountUzs());

        return new ProposalResponse(proposalId,
                Instant.now().plusSeconds(ttlSeconds));
    }

    /**
     * Look up the active proposal for a marketplace chat. Returns empty when
     * no proposal exists or the viewer is not a participant — we deliberately
     * don't distinguish "not found" from "not authorised" so the endpoint
     * doesn't leak proposal existence.
     */
    public Optional<ProposalDetailsResponse> findActiveProposalByChatId(
            UUID chatId, UUID viewerUserId) {
        String indexKey = chatIndexKey(chatId);
        String proposalIdStr = redis.opsForValue().get(indexKey);
        if (proposalIdStr == null) return Optional.empty();

        UUID proposalId = UUID.fromString(proposalIdStr);
        String mainKey = redisKey(proposalId);
        Map<Object, Object> raw = redis.opsForHash().entries(mainKey);
        if (raw.isEmpty()) return Optional.empty();

        UUID sellerId       = UUID.fromString((String) raw.get("sellerId"));
        UUID buyerId        = UUID.fromString((String) raw.get("buyerId"));
        if (!viewerUserId.equals(sellerId) && !viewerUserId.equals(buyerId)) {
            return Optional.empty();
        }

        UUID proposerUserId = UUID.fromString((String) raw.get("proposerUserId"));
        UUID marketplaceChatId = UUID.fromString((String) raw.get("marketplaceChatId"));
        long amountUzs      = Long.parseLong((String) raw.get("amountUzs"));
        UUID listingId      = optionalUuid(raw.get("listingId"));
        TradeMode mode      = TradeMode.valueOf(
                orDefault((String) raw.get("mode"), TradeMode.SMART.name()));
        UUID adminId        = optionalUuid(raw.get("adminId"));
        Long adminFeeUzs    = optionalLong(raw.get("adminFeeUzs"));

        Long ttl = redis.getExpire(mainKey, TimeUnit.SECONDS);
        Instant expiresAt = (ttl != null && ttl > 0)
                ? Instant.now().plusSeconds(ttl)
                : Instant.now();

        return Optional.of(new ProposalDetailsResponse(
                proposalId, marketplaceChatId, sellerId, buyerId,
                proposerUserId, amountUzs, listingId, expiresAt,
                mode, adminId, adminFeeUzs));
    }

    @Transactional
    public TradeResponse accept(UUID accepterUserId, UUID proposalId, UUID accepterCardId) {
        String mainKey = redisKey(proposalId);
        Map<Object, Object> raw = redis.opsForHash().entries(mainKey);
        if (raw.isEmpty()) {
            throw new ProposalNotFoundException(proposalId.toString());
        }

        UUID proposerUserId = UUID.fromString((String) raw.get("proposerUserId"));
        UUID sellerId       = UUID.fromString((String) raw.get("sellerId"));
        UUID buyerId        = UUID.fromString((String) raw.get("buyerId"));
        long amountUzs      = Long.parseLong((String) raw.get("amountUzs"));
        UUID proposerCard   = optionalUuid(raw.get("proposerCardId"));

        // The accepter must be the OTHER party — a proposer accepting their own proposal is nonsense.
        if (accepterUserId.equals(proposerUserId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Proposer cannot accept own proposal");
        }

        TradeMode mode = TradeMode.valueOf(
                orDefault((String) raw.get("mode"), TradeMode.SMART.name()));
        UUID adminId  = optionalUuid(raw.get("adminId"));
        Long adminFee = optionalLong(raw.get("adminFeeUzs"));

        UUID sellerCardId;
        UUID buyerCardId;
        if (mode == TradeMode.HUMAN) {
            // No platform payment, so no cards at all.
            sellerCardId = null;
            buyerCardId  = null;
            if (adminId == null || adminFee == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Inson admin savdosida admin va haq ko'rsatilishi shart");
            }
            // Re-check, not just at create(): the proposal lives 10 minutes and
            // in that window the admin can lose the ROLE_TRADE_ADMIN role,
            // pause new orders, or move their fee band. This accept is what
            // writes assigned_admin_id, so a stale check opens a trade bound to
            // somebody whose own accept() throws 403 and who — once their token
            // drops ROLE_TRADE_ADMIN — cannot reach the decline endpoint
            // either, leaving 24h to ORPHANED as the only exit.
            adminProfiles.requireHireable(adminId, adminFee);
        } else {
            if (accepterCardId == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Smart savdo uchun kartangizni tanlang");
            }
            sellerCardId = sellerId.equals(proposerUserId) ? proposerCard : accepterCardId;
            buyerCardId  = buyerId.equals(proposerUserId)  ? proposerCard : accepterCardId;
        }

        UUID listingId = optionalUuid(raw.get("listingId"));
        UUID chatId    = optionalUuid(raw.get("marketplaceChatId"));

        var trade = trades.openTrade(sellerId, buyerId, amountUzs,
                sellerCardId, buyerCardId, listingId, chatId, mode, adminId, adminFee);

        redis.delete(mainKey);
        if (chatId != null) redis.delete(chatIndexKey(chatId));
        events.proposalResolved(proposalId, TradeEvents.ProposalOutcome.ACCEPTED);
        audit.record(trade.id(), ActorType.USER, accepterUserId, "PROPOSAL_ACCEPTED",
                Map.of("proposalId", proposalId.toString()));
        return trade;
    }

    public void reject(UUID rejecterUserId, UUID proposalId) {
        String mainKey = redisKey(proposalId);
        // Read chatId BEFORE deleting the main key so we can clean the index too.
        Object rawChatId = redis.opsForHash().get(mainKey, "marketplaceChatId");
        if (Boolean.FALSE.equals(redis.delete(mainKey))) {
            throw new ProposalNotFoundException(proposalId.toString());
        }
        UUID chatId = optionalUuid(rawChatId);
        if (chatId != null) redis.delete(chatIndexKey(chatId));
        events.proposalResolved(proposalId, TradeEvents.ProposalOutcome.REJECTED);
    }

    private static UUID optionalUuid(Object v) {
        if (v == null) return null;
        String s = v.toString();
        return s.isBlank() ? null : UUID.fromString(s);
    }

    private static Long optionalLong(Object v) {
        if (v == null) return null;
        String s = v.toString();
        return s.isBlank() ? null : Long.valueOf(s);
    }

    private static String orDefault(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }

    private static String redisKey(UUID proposalId) {
        return "trade:proposal:" + proposalId;
    }

    private static String chatIndexKey(UUID chatId) {
        return "trade:proposal:by-chat:" + chatId;
    }
}
