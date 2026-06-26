package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ListingService {

    private final ListingRepository listings;
    private final ListingMapper mapper;
    private final MarketplaceEventPublisher events;

    @Transactional
    public Listing create(UUID sellerId, ListingCreateRequest request) {
        Listing listing = mapper.toEntity(request);
        listing.setSellerId(sellerId);
        listing.setStatus(ListingStatus.ACTIVE);
        Listing saved = listings.save(listing);
        events.listingCreated(saved);
        log.info("Listing created: id={} sellerId={}", saved.getId(), sellerId);
        return saved;
    }

    @Transactional
    public Listing update(UUID id, UUID sellerId, ListingUpdateRequest request) {
        Listing listing = getActiveOwned(id, sellerId);
        mapper.update(listing, request);
        events.listingUpdated(listing);
        return listing;
    }

    @Transactional
    public Listing delete(UUID id, UUID sellerId) {
        Listing listing = getOwned(id, sellerId);
        listing.setStatus(ListingStatus.DELETED);
        events.listingDeleted(listing.getId(), sellerId, ListingStatus.DELETED);
        log.info("Listing deleted (soft): id={} sellerId={}", id, sellerId);
        return listing;
    }

    @Transactional
    public Listing markSold(UUID id, UUID sellerId) {
        Listing listing = getActiveOwned(id, sellerId);
        listing.setStatus(ListingStatus.SOLD);
        events.listingDeleted(listing.getId(), sellerId, ListingStatus.SOLD);
        return listing;
    }

    @Transactional
    public void setMediaMessageIds(UUID id, UUID sellerId, java.util.List<String> messageIds) {
        Listing listing = getActiveOwned(id, sellerId);
        listing.setMediaMessageIds(messageIds);
        events.listingUpdated(listing);
    }

    @Transactional(readOnly = true)
    public Listing getById(UUID id) {
        return listings.findById(id).orElseThrow(MarketplaceException::listingNotFound);
    }

    @Transactional(readOnly = true)
    public Page<Listing> browse(ListingFilter filter, Pageable pageable) {
        return listings.findAll(ListingSpecifications.withFilter(filter), pageable);
    }

    @Transactional(readOnly = true)
    public Page<Listing> findMine(UUID sellerId, Pageable pageable) {
        return listings.findBySellerId(sellerId, pageable);
    }

    // ----- internal -----

    private Listing getOwned(UUID id, UUID sellerId) {
        Listing l = listings.findById(id).orElseThrow(MarketplaceException::listingNotFound);
        if (!l.getSellerId().equals(sellerId)) {
            throw MarketplaceException.notOwner();
        }
        return l;
    }

    private Listing getActiveOwned(UUID id, UUID sellerId) {
        Listing l = getOwned(id, sellerId);
        if (l.getStatus() != ListingStatus.ACTIVE) {
            throw MarketplaceException.listingNotActive();
        }
        return l;
    }
}
