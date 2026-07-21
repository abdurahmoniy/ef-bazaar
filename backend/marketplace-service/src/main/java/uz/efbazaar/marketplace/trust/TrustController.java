package uz.efbazaar.marketplace.trust;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.trust.TrustDtos.BlacklistEntryResponse;
import uz.efbazaar.marketplace.trust.TrustDtos.ComplaintResponse;
import uz.efbazaar.marketplace.trust.TrustDtos.FileComplaintRequest;

import java.util.Map;
import java.util.UUID;

/**
 * User-facing trust endpoints. The public blacklist exposes reason + dates +
 * confirmed-complaint count only — evidence and complainant identities never
 * leave the admin surface. Rate limiting for the public routes lives at
 * nginx (scraping target).
 */
@RestController
@RequiredArgsConstructor
public class TrustController {

    private final TrustService service;
    private final BlacklistGuard guard;

    /** Shikoyat berish — match/savdo/chat kontekstidan. */
    @PostMapping("/api/v1/complaints")
    @ResponseStatus(HttpStatus.CREATED)
    public ComplaintResponse file(@AuthenticationPrincipal AuthenticatedUser user,
                                  @Valid @RequestBody FileComplaintRequest request) {
        return ComplaintResponse.from(service.fileComplaint(user.userId(), request));
    }

    /** Public qora ro'yxat — bozor "Qora ro'yxat" tab'i. */
    @GetMapping("/api/v1/blacklist")
    public Page<BlacklistEntryResponse> blacklist(@PageableDefault(size = 20) Pageable pageable) {
        return service.publicBlacklist(pageable);
    }

    /** Arzon boolean check — listing/chat sahifalaridagi ogohlantirish banneri uchun. */
    @GetMapping("/api/v1/blacklist/check")
    public Map<String, Boolean> check(@RequestParam UUID userId) {
        return Map.of("blacklisted", guard.isBlacklisted(userId));
    }
}
