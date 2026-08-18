package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingResponse;
import uz.efbazaar.marketplace.dto.SellerSummary;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Decorates {@link ListingResponse} objects with {@code likeCount}, {@code likedByMe},
 * and {@code seller} by batching repository and remote lookups instead of N+1 queries per row.
 */
@Component
@RequiredArgsConstructor
public class ListingViewAssembler {

    private final ListingMapper mapper;
    private final LikeService likeService;
    private final AuthSummaryClient authSummary;

    public ListingResponse assemble(Listing listing, UUID viewerId) {
        long count = likeService.countByListing(listing.getId());
        Boolean likedByMe = viewerId == null ? null
                : likeService.userLikedListings(viewerId, List.of(listing.getId()))
                        .contains(listing.getId());
        SellerSummary seller = authSummary.resolve(listing.getSellerId())
                .map(SellerSummary::from)
                .orElse(null);
        return augment(mapper.toResponse(listing), count, likedByMe, seller);
    }

    public List<ListingResponse> assembleAll(Collection<Listing> listings, UUID viewerId) {
        List<UUID> ids = listings.stream().map(Listing::getId).toList();
        List<UUID> sellerIds = listings.stream().map(Listing::getSellerId).distinct().toList();
        Map<UUID, Long> counts = likeService.countByListings(ids);
        Set<UUID> liked = viewerId == null ? Set.of() : likeService.userLikedListings(viewerId, ids);
        Map<UUID, AuthSummaryClient.UserSummary> sellers = authSummary.resolveAll(sellerIds);

        return listings.stream()
                .map(l -> augment(
                        mapper.toResponse(l),
                        counts.getOrDefault(l.getId(), 0L),
                        viewerId == null ? null : liked.contains(l.getId()),
                        SellerSummary.from(sellers.get(l.getSellerId()))))
                .toList();
    }

    private ListingResponse augment(ListingResponse r, long likeCount, Boolean likedByMe, SellerSummary seller) {
        return new ListingResponse(
                r.id(), r.sellerId(), seller, r.description(),
                r.price(), r.priceNegotiable(), r.attributes(), r.mediaMessageIds(),
                r.status(), r.soldAt(), r.forwardCount(), likeCount, likedByMe,
                r.matchPercent(), r.matchDetails(), r.createdAt(), r.updatedAt()
        );
    }
}
