package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.CartItem;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.CartItemRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class CartService {

    private final CartItemRepository cart;
    private final ListingRepository listings;

    @Transactional
    public CartItem add(UUID userId, UUID listingId) {
        Listing listing = listings.findById(listingId)
                .orElseThrow(MarketplaceException::listingNotFound);
        if (listing.getStatus() != ListingStatus.ACTIVE) {
            throw MarketplaceException.listingNotActive();
        }

        return cart.findByUserIdAndListingId(userId, listingId)
                .orElseGet(() -> cart.save(CartItem.builder()
                        .userId(userId)
                        .listingId(listingId)
                        .build()));
    }

    @Transactional
    public void remove(UUID userId, UUID listingId) {
        cart.deleteByUserIdAndListingId(userId, listingId);
    }

    @Transactional(readOnly = true)
    public List<CartItem> list(UUID userId) {
        return cart.findByUserIdOrderByCreatedAtDesc(userId);
    }
}
