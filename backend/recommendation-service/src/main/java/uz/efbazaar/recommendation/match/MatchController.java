package uz.efbazaar.recommendation.match;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.recommendation.exception.RecommendationException;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Player filtri. Faqat ID va ball — filtr, sahifalash va e'lon ko'rinishi marketplace'da
 * ({@code POST /listings/ranked}); birlashtirishni frontend qiladi.
 */
@RestController
@RequestMapping("/api/v1/match")
public class MatchController {

    public static final int MAX_IDS = 1000;
    public static final int MAX_DETAIL_IDS = 100;

    private final MatchEngine engine;
    private final MatchRequestParser parser;
    private final LegacyDreamTeamAdapter legacy;

    public MatchController(MatchEngine engine, MatchRequestParser parser, LegacyDreamTeamAdapter legacy) {
        this.engine = engine;
        this.parser = parser;
        this.legacy = legacy;
    }

    @GetMapping
    public MatchIdsResponse match(
            @RequestParam(name = "matchCard", required = false) List<String> matchCards,
            @RequestParam(name = "matchStrictness", required = false) Integer matchStrictness,
            @RequestParam(name = "dream_team", required = false) String legacyTeam,
            @RequestParam(name = "dream_team_min_match", required = false) String legacyMinimum) {
        MatchRequest request = resolve(matchCards, matchStrictness, legacyTeam, legacyMinimum);
        return new MatchIdsResponse(engine.rank(request, MAX_IDS));
    }

    @GetMapping("/details")
    public Map<UUID, MatchDetails> details(
            @RequestParam List<UUID> ids,
            @RequestParam(name = "matchCard", required = false) List<String> matchCards,
            @RequestParam(name = "matchStrictness", required = false) Integer matchStrictness,
            @RequestParam(name = "dream_team", required = false) String legacyTeam,
            @RequestParam(name = "dream_team_min_match", required = false) String legacyMinimum) {
        if (ids.isEmpty() || ids.size() > MAX_DETAIL_IDS) {
            throw RecommendationException.badRequest("too_many_ids",
                    "ids 1 dan " + MAX_DETAIL_IDS + " tagacha bo'lishi kerak");
        }
        MatchRequest request = resolve(matchCards, matchStrictness, legacyTeam, legacyMinimum);
        Map<UUID, MatchDetails> result = new LinkedHashMap<>();
        engine.hits(request.weighted(), new LinkedHashSet<>(ids))
                .forEach((id, hit) -> result.put(id, MatchDetails.of(hit, request)));
        return result;
    }

    @GetMapping("/{listingId}")
    public MatchDetails one(
            @PathVariable UUID listingId,
            @RequestParam(name = "matchCard", required = false) List<String> matchCards,
            @RequestParam(name = "matchStrictness", required = false) Integer matchStrictness,
            @RequestParam(name = "dream_team", required = false) String legacyTeam,
            @RequestParam(name = "dream_team_min_match", required = false) String legacyMinimum) {
        MatchRequest request = resolve(matchCards, matchStrictness, legacyTeam, legacyMinimum);
        MatchHit hit = engine.hits(request.weighted(), List.of(listingId)).get(listingId);
        if (hit == null) {
            throw RecommendationException.listingNotFound();
        }
        return MatchDetails.of(hit, request);
    }

    private MatchRequest resolve(List<String> matchCards, Integer strictness,
                                 String legacyTeam, String legacyMinimum) {
        return parser.parse(matchCards, strictness)
                .or(() -> legacy.parse(legacyTeam, legacyMinimum))
                .orElseThrow(() -> RecommendationException.badRequest("match_required",
                        "Kamida bitta matchCard kerak"));
    }
}
