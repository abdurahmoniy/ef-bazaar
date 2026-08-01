package uz.efbazaar.marketplace.cards;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin player-card management. Reads go through the public
 * {@link CardController} — the only privileged operation is curating
 * {@link MetaTier}. Gated by {@code ROLE_ADMIN} in
 * {@link uz.efbazaar.marketplace.config.SecurityConfig}.
 */
@RestController
@RequestMapping("/api/v1/admin/cards")
@RequiredArgsConstructor
public class AdminCardController {

    private final CardSearchService cardSearchService;

    /** @return how many rows actually changed (already-correct cards don't count) */
    @PutMapping("/meta-tier")
    public CardMetaTierUpdateResponse setMetaTier(@Valid @RequestBody CardMetaTierUpdateRequest request) {
        int updated = cardSearchService.updateMetaTier(request.efhubIds(), request.metaTier());
        return new CardMetaTierUpdateResponse(updated, request.efhubIds().size());
    }
}
