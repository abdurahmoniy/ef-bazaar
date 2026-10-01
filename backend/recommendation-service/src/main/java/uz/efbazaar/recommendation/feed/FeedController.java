package uz.efbazaar.recommendation.feed;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.MatchDetails;
import uz.efbazaar.recommendation.security.AuthenticatedUser;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** "Mening qiziqishlarim": faqat tartib. Filtr va sahifalash marketplace'da (POST /listings/ranked). */
@RestController
@RequestMapping("/api/v1/feed")
public class FeedController {

    public static final int MAX_DETAIL_IDS = 100;

    private final FeedService service;

    public FeedController(FeedService service) {
        this.service = service;
    }

    @GetMapping
    public FeedResponse feed(@AuthenticationPrincipal AuthenticatedUser viewer,
                             @RequestParam(required = false) String profileHash) {
        return service.feed(viewer == null ? null : viewer.userId(), profileHash);
    }

    @GetMapping("/details")
    public Map<UUID, MatchDetails> details(@AuthenticationPrincipal AuthenticatedUser viewer,
                                           @RequestParam List<UUID> ids) {
        if (ids.isEmpty() || ids.size() > MAX_DETAIL_IDS) {
            throw RecommendationException.badRequest("too_many_ids",
                    "ids 1 dan " + MAX_DETAIL_IDS + " tagacha bo'lishi kerak");
        }
        return service.details(viewer == null ? null : viewer.userId(), ids);
    }
}
