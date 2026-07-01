package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingResponse;
import uz.efbazaar.marketplace.mapper.ListingMapper;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Decorates {@link ListingResponse} objects with {@code likeCount} and {@code likedByMe}
 * by batching repository lookups instead of N+1 queries per row.
 */
@Component
@RequiredArgsConstructor
public class ListingViewAssembler {

    private final ListingMapper mapper;
    private final LikeService likeService;

    public ListingResponse assemble(Listing listing, UUID viewerId) {
        long count = likeService.countByListing(listing.getId());
        Boolean likedByMe = viewerId == null ? null
                : likeService.userLikedListings(viewerId, List.of(listing.getId()))
                        .contains(listing.getId());
        return augment(mapper.toResponse(listing), count, likedByMe);
    }

    public List<ListingResponse> assembleAll(Collection<Listing> listings, UUID viewerId) {
        List<UUID> ids = listings.stream().map(Listing::getId).toList();
        Map<UUID, Long> counts = likeService.countByListings(ids);
        Set<UUID> liked = viewerId == null ? Set.of() : likeService.userLikedListings(viewerId, ids);

        return listings.stream()
                .map(l -> augment(
                        mapper.toResponse(l),
                        counts.getOrDefault(l.getId(), 0L),
                        viewerId == null ? null : liked.contains(l.getId())))
                .toList();
    }

    private ListingResponse augment(ListingResponse r, long likeCount, Boolean likedByMe) {
        return new ListingResponse(
                r.id(), r.sellerId(), r.description(),
                r.price(), r.priceNegotiable(), r.attributes(), r.mediaMessageIds(),
                r.status(), r.forwardCount(), likeCount, likedByMe,
                r.createdAt(), r.updatedAt()
        );
    }
}
