package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ListingService {

    private final ListingRepository listings;
    private final ListingMapper mapper;
    private final AttributeValidator attributeValidator;
    private final MediaService mediaService;
    private final ListingCaptionBuilder captionBuilder;
    private final MarketplaceEventPublisher events;

    /**
     * Atomic create — validates payload/attrs first (fail fast, no side effect),
     * then uploads to Telegram with rich caption, then persists. The bot upload
     * is intentionally OUTSIDE any JPA transaction so a slow Telegram call
     * doesn't hold a DB lock. 200 is returned only after DB commit, satisfying
     * the invariant that "response OK ⇒ both bot upload and DB write happened".
     */
    public Listing create(UUID sellerId, ListingCreateRequest request, List<MultipartFile> files) {
        mediaService.validate(files);
        Map<String, Object> validated = attributeValidator.validate(request.attributes());

        Listing listing = mapper.toEntity(request);
        listing.setId(UUID.randomUUID());
        listing.setSellerId(sellerId);
        listing.setStatus(ListingStatus.ACTIVE);
        listing.setAttributes(validated);

        String caption = captionBuilder.build(listing);
        List<String> fileIds = mediaService.uploadToBot(files, caption);
        listing.setMediaMessageIds(fileIds);

        // save() opens its own short tx via Spring Data — no long-running DB lock
        // is held across the bot upload above.
        Listing saved = listings.save(listing);
        events.listingCreated(saved);
        log.info("Listing created: id={} sellerId={} attributes={} media={}",
                saved.getId(), sellerId, validated.keySet(), fileIds.size());
        return saved;
    }

    /**
     * Atomic full-edit — replaces data + media in one call. Same ordering
     * guarantees as {@link #create}. Old Telegram messages are NOT deleted
     * (audit trail); the listing's mediaMessageIds are overwritten with the
     * new set only after the fresh upload succeeds.
     */
    public Listing update(UUID id, UUID sellerId,
                          ListingUpdateRequest request,
                          List<MultipartFile> files) {
        mediaService.validate(files);
        Listing listing = getActiveOwned(id, sellerId);

        mapper.update(listing, request);
        if (request.attributes() != null) {
            listing.setAttributes(attributeValidator.validate(request.attributes()));
        }

        String caption = captionBuilder.build(listing);
        List<String> fileIds = mediaService.uploadToBot(files, caption);
        listing.setMediaMessageIds(fileIds);

        Listing saved = listings.save(listing);
        events.listingUpdated(saved);
        log.info("Listing updated: id={} sellerId={} media={}", id, sellerId, fileIds.size());
        return saved;
    }

    @Transactional
    public Listing delete(UUID id, UUID sellerId) {
        Listing listing = getOwned(id, sellerId);
        listing.setStatus(ListingStatus.DELETED);
        Listing saved = listings.save(listing);
        events.listingDeleted(saved.getId(), sellerId, ListingStatus.DELETED);
        log.info("Listing deleted (soft): id={} sellerId={}", id, sellerId);
        return saved;
    }

    @Transactional
    public Listing markSold(UUID id, UUID sellerId) {
        Listing listing = getActiveOwned(id, sellerId);
        listing.setStatus(ListingStatus.SOLD);
        Listing saved = listings.save(listing);
        events.listingDeleted(saved.getId(), sellerId, ListingStatus.SOLD);
        return saved;
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
