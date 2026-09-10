package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ListingViewService {
    private final ListingService listings;
    private final JdbcTemplate jdbc;

    /** One view per account, or per persistent guest browser identity. */
    @Transactional
    public long recordView(UUID id, UUID viewerId, UUID guestId) {
        Listing listing = listings.getForViewer(id, viewerId);
        if (listing.getStatus() == ListingStatus.DELETED) {
            throw MarketplaceException.listingNotFound();
        }
        if (listing.getStatus() != ListingStatus.ACTIVE || listing.getSellerId().equals(viewerId)) {
            return listing.getViewCount();
        }

        String viewerKey = viewerId != null ? "user:" + viewerId
                : "guest:" + java.util.Objects.requireNonNull(guestId);
        // The unique viewer insert and counter update are one statement. Even
        // duplicate concurrent requests return the latest count without adding
        // another view. Leave updated_at alone: a view is not an edit.
        List<Long> counts = jdbc.query("""
                WITH new_view AS (
                    INSERT INTO listing_views (listing_id, viewer_key)
                    SELECT id, ? FROM listings WHERE id = ? AND status = 'ACTIVE'
                    ON CONFLICT (listing_id, viewer_key) DO NOTHING
                    RETURNING listing_id
                )
                UPDATE listings SET unique_view_count = unique_view_count + (SELECT COUNT(*) FROM new_view)
                 WHERE id = ? AND status = 'ACTIVE'
                 RETURNING unique_view_count
                """, (rs, row) -> rs.getLong("unique_view_count"), viewerKey, id, id);
        if (counts.isEmpty()) throw MarketplaceException.listingNotFound();
        return counts.getFirst();
    }
}
