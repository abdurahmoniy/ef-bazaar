package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/**
 * The two facts trade-service needs about a listing before opening a trade.
 *
 * <p>Both must come from here rather than the client. The price decides the
 * platform's fee on a swap — a proposer who could name it would name the number
 * that lands on the cheapest band. And {@code exchangeMode} decides whether a
 * swap is offered at all, which the seller set when they published; a proposal
 * that ignores it would open a swap on an account advertised as sale-only.
 *
 * <p>Auth is the shared internal secret, same as the trust bridge; nginx blocks
 * the {@code /internal} prefix from outside.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/listings")
@RequiredArgsConstructor
public class InternalListingController {

    private final ListingRepository listings;

    /** {@code exchangeMode} is null when the seller never set one. */
    public record ListingTerms(UUID id, UUID sellerId, BigDecimal price,
                               String status, String exchangeMode) {}

    @GetMapping("/{id}/terms")
    public ListingTerms terms(@PathVariable UUID id) {
        Listing listing = listings.findById(id)
                .orElseThrow(MarketplaceException::listingNotFound);
        Map<String, Object> attributes = listing.getAttributes();
        Object mode = attributes == null ? null : attributes.get("exchange_mode");
        return new ListingTerms(
                listing.getId(),
                listing.getSellerId(),
                listing.getPrice(),
                listing.getStatus().name(),
                mode == null ? null : mode.toString());
    }
}
