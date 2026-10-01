package uz.efbazaar.marketplace.recommendation;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** /internal/** — InternalSecretFilter (X-Internal-Secret) himoyalaydi; nginx tashqariga chiqarmaydi. */
@RestController
@RequestMapping("/internal/marketplace/v1/rec")
@RequiredArgsConstructor
public class InternalRecommendationController {

    private final RecommendationReplayService replay;

    @PostMapping("/replay")
    public RecommendationReplayService.ReplayResult replay() {
        return replay.replay();
    }
}
