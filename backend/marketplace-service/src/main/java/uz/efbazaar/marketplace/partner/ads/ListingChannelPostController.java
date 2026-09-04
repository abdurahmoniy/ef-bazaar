package uz.efbazaar.marketplace.partner.ads;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/**
 * Mavjud e'lonni hamkor kanallariga joylash.
 *
 * <p>E'lon YARATISHDAN ajratilgan va bu ataylab. Tahrirlash {@code PUT}
 * i har saqlashda ishlaydi; kanallar ro'yxati unga qo'shilsa, tavsifni
 * tuzatgani uchun hamyondan pul yechilib ketishi mumkin edi. Pul
 * harakati ataylab bosilgan alohida tugmadan bo'lishi kerak.
 */
@RestController
@RequestMapping("/api/v1/listings/{listingId}/channel-posts")
@RequiredArgsConstructor
public class ListingChannelPostController {

    private final ListingChannelPostService service;

    /** Shu e'lon qaysi kanallarga, qachon chiqqan. */
    @GetMapping
    public List<ListingChannelPostService.PostedChannel> posted(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID listingId) {
        return service.postedChannels(user.userId(), listingId);
    }

    @PostMapping
    public void order(@AuthenticationPrincipal AuthenticatedUser user,
                      @PathVariable UUID listingId,
                      @Valid @RequestBody OrderRequest request) {
        service.order(user.userId(), listingId, request.channelIds());
    }

    public record OrderRequest(@NotEmpty List<UUID> channelIds) {}
}
