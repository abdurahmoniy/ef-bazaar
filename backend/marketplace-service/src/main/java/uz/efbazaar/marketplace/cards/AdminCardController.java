package uz.efbazaar.marketplace.cards;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.cards.sync.MaxOvrRefreshService;

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
    private final MaxOvrRefreshService maxOvrRefreshService;

    /** @return how many rows actually changed (already-correct cards don't count) */
    @PutMapping("/meta-tier")
    public CardMetaTierUpdateResponse setMetaTier(@Valid @RequestBody CardMetaTierUpdateRequest request) {
        int updated = cardSearchService.updateMetaTier(request.efhubIds(), request.metaTier());
        return new CardMetaTierUpdateResponse(updated, request.efhubIds().size());
    }

    /**
     * Backfill {@code max_overall_rating} from the efhub player index.
     *
     * <p>The maxed OVR exists only in the index — player pages carry the
     * level-1 rating — so no re-scrape can fill it. The daily sync does this
     * too; this endpoint exists so it can be triggered without shell access to
     * the server. One HTTP call to efhub plus a batched UPDATE, no page
     * scraping, safe to repeat.
     */
    @PostMapping("/max-ovr-refresh")
    public MaxOvrRefreshService.Result refreshMaxOvr() {
        return maxOvrRefreshService.refresh();
    }
}
