package uz.efbazaar.marketplace.cards;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import uz.efbazaar.marketplace.cards.sync.EfhubSyncTrigger;
import uz.efbazaar.marketplace.cards.sync.MaxOvrRefreshService;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;

import java.util.EnumSet;
import java.util.Set;

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
    private final CardInterestService cardInterestService;
    private final EfhubSyncTrigger efhubSyncTrigger;

    /** @return how many rows actually changed (already-correct cards don't count) */
    @PutMapping("/meta-tier")
    public CardMetaTierUpdateResponse setMetaTier(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @Valid @RequestBody CardMetaTierUpdateRequest request) {
        int updated = cardSearchService.updateMetaLifecycle(request, admin.userId());
        return new CardMetaTierUpdateResponse(updated, request.efhubIds().size());
    }

    @PostMapping("/meta-tier/expire")
    public CardMetaTierUpdateResponse expireMeta(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @Valid @RequestBody CardMetaExpireRequest request) {
        int updated = cardSearchService.expireMeta(request.efhubIds(), request.reason(), admin.userId());
        return new CardMetaTierUpdateResponse(updated, request.efhubIds().size());
    }

    @GetMapping
    public AdminCardPage browse(
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "types", required = false) Set<CardType> types,
            @RequestParam(value = "tier", required = false) MetaTier tier,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return cardInterestService.enrich(cardSearchService.browseAdmin(query,
                types == null ? EnumSet.allOf(CardType.class) : types, tier, page, size));
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

    /**
     * Run the daily efhub sync now, without waiting for the 09:00 UTC cron.
     *
     * <p>Answers immediately: a full run scrapes up to {@code batch-limit}
     * player pages 5s apart, far longer than the request may stay open. The
     * outcome arrives as the usual "Card sync bajarildi" summary in the
     * Telegram log channel.
     *
     * @return 202 once dispatched, 409 if a run is already in progress
     */
    @PostMapping("/sync")
    public ResponseEntity<EfhubSyncTriggerResponse> triggerSync() {
        EfhubSyncTrigger.Status status = efhubSyncTrigger.trigger();
        HttpStatus code = status == EfhubSyncTrigger.Status.STARTED
                ? HttpStatus.ACCEPTED
                : HttpStatus.CONFLICT;
        return ResponseEntity.status(code).body(new EfhubSyncTriggerResponse(status));
    }

    /** @param status whether this call started a run or found one already going */
    public record EfhubSyncTriggerResponse(EfhubSyncTrigger.Status status) {}
}
