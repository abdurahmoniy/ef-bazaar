package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

/** Short primary-database transaction entered only after any media upload. */
@Component
@RequiredArgsConstructor
public class ListingPersistence {

    private final ListingRepository listings;
    private final ListingCardInventory inventory;

    @Transactional
    public Listing saveWithCardInventory(Listing listing) {
        // saveAndFlush, not save. The id is a @GeneratedValue UUID, which
        // Hibernate assigns in memory -- it never needs the database to produce
        // one, so it defers the INSERT to flush time. ListingCardInventory
        // writes through JdbcTemplate, which bypasses the persistence context
        // and reaches the database first, and listing_cards.listing_id has a
        // foreign key to a row that is not there yet. Flushing here puts the
        // listing in the same transaction the JDBC statements can see.
        Listing saved = listings.saveAndFlush(listing);
        Object cards = saved.getAttributes() == null
                ? null
                : saved.getAttributes().get("valuable_players");
        inventory.replace(saved.getId(), cards);
        return saved;
    }
}
