package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ListingPersistenceTest {

    @Test
    void saves_listing_and_replaces_inventory_in_one_transaction() throws Exception {
        ListingRepository listings = mock(ListingRepository.class);
        ListingCardInventory inventory = mock(ListingCardInventory.class);
        uz.efbazaar.marketplace.recommendation.ListingValueScorer valueScorer =
                mock(uz.efbazaar.marketplace.recommendation.ListingValueScorer.class);
        ListingPersistence persistence = new ListingPersistence(listings, inventory, valueScorer);
        UUID listingId = UUID.randomUUID();
        List<Map<String, Object>> cards = List.of(Map.of(
                "efhub_id", 101L, "player_id", UUID.randomUUID().toString(), "name", "Messi"));
        Listing listing = Listing.builder()
                .id(listingId)
                .attributes(Map.of("valuable_players", cards))
                .build();
        when(listings.saveAndFlush(any(Listing.class))).thenReturn(listing);

        assertThat(persistence.saveWithCardInventory(listing)).isSameAs(listing);

        var ordered = inOrder(listings, inventory);
        // saveAndFlush, not save: the inventory writes through JdbcTemplate,
        // which does not see the persistence context, so an unflushed listing
        // means listing_cards.listing_id points at a row the database does not
        // have yet and the insert dies on the foreign key.
        //
        // A mock cannot prove flush semantics -- this only stops a regression
        // to save(). The real proof was production: every listing carrying a
        // valuable-players card failed to publish.
        ordered.verify(listings).saveAndFlush(listing);
        ordered.verify(inventory).replace(listingId, cards);
        org.mockito.Mockito.verify(valueScorer).recompute(List.of(listingId));
        assertThat(ListingPersistence.class
                .getMethod("saveWithCardInventory", Listing.class)
                .isAnnotationPresent(Transactional.class)).isTrue();
    }
}
