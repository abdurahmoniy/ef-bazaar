package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.dto.LikeToggleResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.LikeService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/listings/{id}/like")
@RequiredArgsConstructor
public class LikeController {

    private final LikeService likeService;

    @PostMapping
    public LikeToggleResponse toggle(@PathVariable UUID id,
                                     @AuthenticationPrincipal AuthenticatedUser user) {
        return likeService.toggle(id, user.userId());
    }
}
