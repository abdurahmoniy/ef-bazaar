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
        Listing saved = listings.save(listing);
        Object cards = saved.getAttributes() == null
                ? null
                : saved.getAttributes().get("valuable_players");
        inventory.replace(saved.getId(), cards);
        return saved;
    }
}
