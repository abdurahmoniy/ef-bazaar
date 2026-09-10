package uz.efbazaar.marketplace.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ListingViewService;

import java.time.Duration;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/listings")
@RequiredArgsConstructor
public class ListingViewController {
    private static final String VISITOR_COOKIE = "ef_listing_visitor";
    private final ListingViewService views;

    public record ViewCountResponse(long viewCount) {}

    @PostMapping("/{id}/views")
    public ViewCountResponse record(@PathVariable UUID id,
                                    @AuthenticationPrincipal AuthenticatedUser viewer,
                                    @CookieValue(name = VISITOR_COOKIE, required = false) String cookie,
                                    HttpServletRequest request, HttpServletResponse response) {
        UUID guestId = null;
        if (viewer == null) {
            try {
                guestId = cookie == null ? null : UUID.fromString(cookie);
            } catch (IllegalArgumentException ignored) {
                // Replace invalid cookies instead of failing to display a listing.
            }
            if (guestId == null) {
                guestId = UUID.randomUUID();
                response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(VISITOR_COOKIE, guestId.toString())
                        .httpOnly(true).secure(request.isSecure()).sameSite("Lax")
                        .path("/").maxAge(Duration.ofDays(365)).build().toString());
            }
        }
        return new ViewCountResponse(views.recordView(id, viewer == null ? null : viewer.userId(), guestId));
    }
}
