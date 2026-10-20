package uz.efbazaar.recommendation.watch;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.watch.SavedSearchDtos.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/internal/rec/v1/watches")
public class WatchAuthorizationController {
    private final SavedSearchService service;
    private final String secret;
    public WatchAuthorizationController(SavedSearchService service,@Value("${app.internal-api-secret:}") String secret) {
        this.service=service; this.secret=secret;
    }
    @PostMapping("/authorize")
    public Authorization authorize(@RequestHeader(value="X-Internal-Secret",required=false) String supplied,@RequestBody AuthorizationRequest request) {
        if(secret.isBlank() || supplied==null || !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8)))
            throw new RecommendationException(HttpStatus.FORBIDDEN,"forbidden","Ruxsat etilmagan");
        return service.authorize(request);
    }
}
