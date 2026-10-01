package uz.efbazaar.recommendation.interest;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.security.AuthenticatedUser;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/card-interest")
public class CardInterestController {

    static final int MAX_COUNT_IDS = 200;

    private final CardInterestService service;

    public CardInterestController(CardInterestService service) {
        this.service = service;
    }

    @PostMapping("/apply")
    public CardInterestResponse apply(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestHeader(name = "X-Interest-Network", required = false) String networkIdentity,
            @Valid @RequestBody CardInterestRequest request) {
        return service.recordApply(request.efhubIds(), user == null ? null : user.userId(), networkIdentity);
    }

    /** Admin kartalar sahifasi: 7 va 30 kunlik talab. Ruxsat — SecurityConfig (ROLE_ADMIN). */
    @GetMapping("/counts")
    public Map<Long, CardInterestService.Counts> counts(@RequestParam List<Long> ids) {
        if (ids.isEmpty() || ids.size() > MAX_COUNT_IDS) {
            throw RecommendationException.badRequest("too_many_ids",
                    "ids 1 dan " + MAX_COUNT_IDS + " tagacha bo'lishi kerak");
        }
        return service.counts(ids);
    }
}
