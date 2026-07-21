package uz.efbazaar.marketplace.gamer;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.gamer.GamerCardDtos.GamerCardResponse;
import uz.efbazaar.marketplace.gamer.GamerCardDtos.ProfileUpdateRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.UUID;

/**
 * Gamer Card — the player's public "digital passport". {@code GET /{userId}}
 * is public (rendered on listing pages and the share page); {@code /me}
 * variants require auth and the owner id always comes from X-User-Id, never
 * the body.
 */
@RestController
@RequestMapping("/api/v1/gamer-cards")
@RequiredArgsConstructor
public class GamerCardController {

    private final GamerCardService service;

    @GetMapping("/me")
    public GamerCardResponse myCard(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.getCard(user.userId());
    }

    @PutMapping("/me")
    public GamerCardResponse updateMyProfile(@AuthenticationPrincipal AuthenticatedUser user,
                                             @Valid @RequestBody ProfileUpdateRequest request) {
        return service.updateProfile(user.userId(), request);
    }

    @GetMapping("/{userId}")
    public GamerCardResponse card(@PathVariable UUID userId) {
        return service.getCard(userId);
    }
}
