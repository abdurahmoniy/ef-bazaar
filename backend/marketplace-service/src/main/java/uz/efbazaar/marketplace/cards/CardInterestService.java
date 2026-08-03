package uz.efbazaar.marketplace.cards;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.service.CardIdentityVerifier;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Privacy-preserving, deduplicated buyer intent. It never changes META automatically. */
@Service
@Slf4j
public class CardInterestService {

    private static final int RETENTION_DAYS = 90;
    private static final int MAX_ACCEPTED_PER_IDENTITY_DAY = 100;
    private static final long TTL_SECONDS = Duration.ofDays(RETENTION_DAYS).toSeconds();
    private static final DefaultRedisScript<Long> RECORD_SCRIPT = new DefaultRedisScript<>("""
            if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
            local used = tonumber(redis.call('GET', KEYS[3]) or '0')
            if used >= tonumber(ARGV[3]) then return -1 end
            redis.call('SET', KEYS[1], '1', 'EX', ARGV[1])
            redis.call('INCR', KEYS[3])
            redis.call('EXPIRE', KEYS[3], ARGV[1])
            redis.call('HINCRBY', KEYS[2], ARGV[2], 1)
            redis.call('EXPIRE', KEYS[2], ARGV[1])
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final CardIdentityVerifier identities;
    private final byte[] hmacSecret;
    private final Clock clock;

    @Autowired
    public CardInterestService(
            StringRedisTemplate redis,
            CardIdentityVerifier identities,
            @Value("${app.card-interest.hmac-secret}") String hmacSecret) {
        this(redis, identities, hmacSecret, Clock.systemUTC());
    }

    CardInterestService(StringRedisTemplate redis, CardIdentityVerifier identities,
                        String hmacSecret, Clock clock) {
        if (hmacSecret == null || hmacSecret.isBlank()) {
            throw new IllegalStateException("CARD_INTEREST_HMAC_SECRET must be configured");
        }
        this.redis = redis;
        this.identities = identities;
        this.hmacSecret = hmacSecret.getBytes(StandardCharsets.UTF_8);
        this.clock = clock;
    }

    public CardInterestResponse recordApply(Collection<Long> rawIds, UUID userId,
                                            String trustedNetworkIdentity) {
        Set<Long> ids = new LinkedHashSet<>();
        for (Long id : rawIds) if (id != null && id > 0) ids.add(id);
        if (ids.isEmpty() || ids.size() > 11) throw invalid("1 dan 11 tagacha card kerak");
        Map<Long, UUID> valid = identities.resolvePlayerIds(new ArrayList<>(ids));
        if (!valid.keySet().containsAll(ids)) throw invalid("noma'lum card yuborildi");

        String identity = userId != null
                ? "user:" + userId
                : trustedNetworkIdentity == null || trustedNetworkIdentity.isBlank()
                    ? null
                    : "network:" + trustedNetworkIdentity.strip();
        if (identity == null) throw invalid("anonymous identity mavjud emas");
        String identityHash = hmac(identity);
        String date = LocalDate.now(clock).toString();
        int accepted = 0;
        for (Long id : ids) {
            Long result = redis.execute(RECORD_SCRIPT,
                    List.of(dedupeKey(date, identityHash, id), dayKey(date),
                            budgetKey(date, identityHash)),
                    String.valueOf(TTL_SECONDS), String.valueOf(id),
                    String.valueOf(MAX_ACCEPTED_PER_IDENTITY_DAY));
            if (Long.valueOf(1).equals(result)) accepted++;
        }
        return new CardInterestResponse(accepted, ids.size() - accepted);
    }

    public Map<Long, Counts> counts(Collection<Long> rawIds) {
        List<Long> ids = rawIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (ids.isEmpty()) return Map.of();
        try {
            return loadCounts(ids);
        } catch (RuntimeException exception) {
            log.warn("card interest aggregates unavailable, returning zeros: {}", exception.toString());
            Map<Long, Counts> fallback = new HashMap<>();
            ids.forEach(id -> fallback.put(id, new Counts(0, 0)));
            return fallback;
        }
    }

    private Map<Long, Counts> loadCounts(List<Long> ids) {
        Map<Long, long[]> totals = new HashMap<>();
        ids.forEach(id -> totals.put(id, new long[2]));
        List<Object> fields = ids.stream().map(String::valueOf).map(value -> (Object) value).toList();
        LocalDate today = LocalDate.now(clock);
        for (int offset = 0; offset < 30; offset++) {
            List<Object> values = redis.opsForHash().multiGet(
                    dayKey(today.minusDays(offset).toString()), fields);
            for (int i = 0; i < ids.size(); i++) {
                long value = longValue(values == null || i >= values.size() ? null : values.get(i));
                totals.get(ids.get(i))[1] += value;
                if (offset < 7) totals.get(ids.get(i))[0] += value;
            }
        }
        Map<Long, Counts> result = new HashMap<>();
        totals.forEach((id, values) -> result.put(id, new Counts(values[0], values[1])));
        return result;
    }

    public AdminCardPage enrich(AdminCardPage page) {
        Map<Long, Counts> counts = counts(page.items().stream()
                .map(AdminCardSearchResult::efhubId).toList());
        return new AdminCardPage(page.items().stream().map(card -> card.withInterest(
                        counts.getOrDefault(card.efhubId(), new Counts(0, 0)))).toList(),
                page.page(), page.size(), page.total());
    }

    String hmac(String identity) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(identity.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("HMAC unavailable", exception);
        }
    }

    static String dedupeKey(String date, String identityHash, long efhubId) {
        return "card-interest:dedupe:" + date + ":" + identityHash + ":" + efhubId;
    }

    static String dayKey(String date) {
        return "card-interest:day:" + date;
    }

    static String budgetKey(String date, String identityHash) {
        return "card-interest:budget:" + date + ":" + identityHash;
    }

    private static long longValue(Object raw) {
        if (raw instanceof Number number) return number.longValue();
        if (raw instanceof String value) {
            try { return Long.parseLong(value); } catch (NumberFormatException ignored) { return 0; }
        }
        return 0;
    }

    private static MarketplaceException invalid(String reason) {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "invalid_card_interest", reason);
    }

    public record Counts(long days7, long days30) {}
}
