package uz.efbazaar.recommendation.feed;

import org.springframework.stereotype.Service;
import uz.efbazaar.recommendation.match.Criterion;
import uz.efbazaar.recommendation.match.MatchDetails;
import uz.efbazaar.recommendation.match.MatchEngine;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class FeedService {

    private final ProfileService profiles;
    private final FeedRanker ranker;
    private final MatchEngine engine;
    private final FeedCache cache;
    private final FeedProperties props;

    public FeedService(ProfileService profiles, FeedRanker ranker, MatchEngine engine,
                       FeedCache cache, FeedProperties props) {
        this.profiles = profiles;
        this.ranker = ranker;
        this.engine = engine;
        this.cache = cache;
        this.props = props;
    }

    /**
     * Mijoz birinchi javobdagi hash'ni qaytarsa va snapshot hali tirik bo'lsa — aynan o'sha ro'yxat
     * (sessiya ichida tartib o'zgarmaydi). Aks holda joriy profil bo'yicha yangi snapshot.
     */
    public FeedResponse feed(UUID viewerId, String requestedHash) {
        if (viewerId == null) {
            return FeedResponse.EMPTY;
        }
        if (ProfileHash.isWellFormed(requestedHash)) {
            Optional<List<UUID>> pinned = cache.get(viewerId, requestedHash);
            if (pinned.isPresent()) {
                return FeedResponse.of(requestedHash, pinned.get());
            }
        }
        List<Criterion> profile = profiles.profile(viewerId);
        if (profile.isEmpty()) {
            return FeedResponse.EMPTY;
        }
        String hash = ProfileHash.of(profile);
        Optional<List<UUID>> cached = cache.get(viewerId, hash);
        if (cached.isPresent()) {
            return FeedResponse.of(hash, cached.get());
        }
        List<UUID> ids = ranker.rank(profile, viewerId, props.maxIds());
        cache.put(viewerId, hash, ids);
        return FeedResponse.of(hash, ids);
    }

    /** Kartadagi "nega mos" izohi — joriy profil bo'yicha (P7). */
    public Map<UUID, MatchDetails> details(UUID viewerId, List<UUID> ids) {
        if (viewerId == null || ids.isEmpty()) {
            return Map.of();
        }
        List<Criterion> profile = profiles.profile(viewerId);
        if (profile.isEmpty()) {
            return Map.of();
        }
        Map<UUID, MatchDetails> result = new LinkedHashMap<>();
        engine.hits(profile, new LinkedHashSet<>(ids))
                .forEach((id, hit) -> result.put(id, MatchDetails.of(hit, 0, List.of())));
        return result;
    }
}
