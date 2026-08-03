package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.dto.ListingMatchHit;
import uz.efbazaar.marketplace.dto.MatchRequest;

import java.util.Optional;
import java.util.UUID;

public interface ListingMatchRepository {
    Page<ListingMatchHit> findMatches(ListingFilter filter, MatchRequest request, Pageable pageable);
    Optional<ListingMatchHit> findMatch(UUID listingId, MatchRequest request);
}
