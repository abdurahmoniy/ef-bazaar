package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Like;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.LikeToggleResponse;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.LikeRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class LikeService {

    private final LikeRepository likes;
    private final ListingRepository listings;

    @Transactional
    public LikeToggleResponse toggle(UUID listingId, UUID userId) {
        Listing listing = listings.findById(listingId)
                .orElseThrow(MarketplaceException::listingNotFound);
        if (listing.getStatus() != ListingStatus.ACTIVE) {
            throw MarketplaceException.listingNotActive();
        }

        boolean nowLiked;
        var existing = likes.findByListingIdAndUserId(listingId, userId);
        if (existing.isPresent()) {
            likes.delete(existing.get());
            nowLiked = false;
        } else {
            Like like = Like.builder()
                    .listingId(listingId)
                    .userId(userId)
                    .build();
            likes.save(like);
            nowLiked = true;
        }

        long total = likes.countByListingId(listingId);
        // like-toggled endi listing_likes trigger'i + outbox relay orqali chiqadi (V73) —
        // tranzaksiya bilan atomik, qo'lda yuborish ikkinchi nusxa bo'lardi.
        return new LikeToggleResponse(listingId, nowLiked, total);
    }

    @Transactional(readOnly = true)
    public long countByListing(UUID listingId) {
        return likes.countByListingId(listingId);
    }

    /** Bulk: returns map listingId → like count, only for ids present in result. */
    @Transactional(readOnly = true)
    public Map<UUID, Long> countByListings(Collection<UUID> listingIds) {
        if (listingIds.isEmpty()) return Map.of();
        return likes.countByListingIds(listingIds).stream()
                .collect(Collectors.toMap(row -> (UUID) row[0], row -> (Long) row[1]));
    }

    /** Bulk: which of the given listings has the user liked? */
    @Transactional(readOnly = true)
    public Set<UUID> userLikedListings(UUID userId, Collection<UUID> listingIds) {
        if (userId == null || listingIds.isEmpty()) return Set.of();
        return likes.findByUserIdAndListingIdIn(userId, listingIds).stream()
                .map(Like::getListingId)
                .collect(Collectors.toSet());
    }
}
