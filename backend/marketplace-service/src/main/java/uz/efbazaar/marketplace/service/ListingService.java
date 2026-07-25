package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.domain.AttributeType;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import uz.efbazaar.marketplace.trust.BlacklistGuard;

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
    private final AttributeDefinitionRepository attributeDefinitions;
    private final BlacklistGuard blacklistGuard;

    /**
     * Atomic create — validates payload/attrs first (fail fast, no side effect),
     * then uploads to Telegram with rich caption, then persists. The bot upload
     * is intentionally OUTSIDE any JPA transaction so a slow Telegram call
     * doesn't hold a DB lock. 200 is returned only after DB commit, satisfying
     * the invariant that "response OK ⇒ both bot upload and DB write happened".
     */
    public Listing create(UUID sellerId, ListingCreateRequest request, List<MultipartFile> files) {
        if (blacklistGuard.isBlacklisted(sellerId)) {
            throw MarketplaceException.userBlacklisted();
        }
        mediaService.validate(files);
        Map<String, Object> validated = attributeValidator.validate(request.attributes());

        Listing listing = mapper.toEntity(request);
        listing.setId(UUID.randomUUID());
        listing.setSellerId(sellerId);
        listing.setStatus(ListingStatus.ACTIVE);
        listing.setAttributes(validated);

        String caption = captionBuilder.build(listing);
        List<String> fileIds = mediaService.uploadToBot(files, caption, listing.getId());
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
     *
     * <p>When {@code files} is empty the existing mediaMessageIds are kept so
     * text-only edits don't require re-uploading photos.
     */
    public Listing update(UUID id, UUID sellerId,
                          ListingUpdateRequest request,
                          List<MultipartFile> files) {
        boolean replacingMedia = files != null && !files.isEmpty();
        if (replacingMedia) {
            mediaService.validate(files);
        }
        Listing listing = getActiveOwned(id, sellerId);

        mapper.update(listing, request);
        if (request.attributes() != null) {
            listing.setAttributes(attributeValidator.validate(request.attributes()));
        }

        if (replacingMedia) {
            String caption = captionBuilder.build(listing);
            List<String> fileIds = mediaService.uploadToBot(files, caption, listing.getId());
            listing.setMediaMessageIds(fileIds);
        }

        Listing saved = listings.save(listing);
        events.listingUpdated(saved);
        log.info("Listing updated: id={} sellerId={} mediaReplaced={} media={}",
                id, sellerId, replacingMedia, listing.getMediaMessageIds().size());
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
        // Prepend "status ASC" so ACTIVE (alphabetically less than SOLD) is
        // always ranked ahead of SOLD, then the caller's sort takes over.
        // Buyers see live inventory first without SOLD entries disappearing.
        org.springframework.data.domain.Sort combined =
                org.springframework.data.domain.Sort.by(
                        org.springframework.data.domain.Sort.Order.asc("status"))
                        .and(pageable.getSort());
        org.springframework.data.domain.Pageable ranked =
                org.springframework.data.domain.PageRequest.of(
                        pageable.getPageNumber(), pageable.getPageSize(), combined);
        return listings.findAll(
                ListingSpecifications.withFilter(sanitizeRangeFilters(filter)), ranked);
    }

    /**
     * Range keys ({@code <key>.min}/{@code <key>.max}) are only honored for
     * active INT/DECIMAL attribute definitions — the Specification casts the
     * JSONB text to numeric, and letting a caller aim that cast at a string
     * attribute (or send a non-numeric bound) would abort the whole query.
     * Offending keys are dropped silently; equality keys pass through as-is.
     */
    ListingFilter sanitizeRangeFilters(ListingFilter filter) {
        Map<String, Object> attrs = filter.attributes();
        if (attrs == null || attrs.isEmpty()
                || attrs.keySet().stream().noneMatch(ListingSpecifications::isRangeKey)) {
            return filter;
        }

        Set<String> numericKeys = attributeDefinitions.findAllByActiveTrueOrderByPositionAsc().stream()
                .filter(d -> d.getType() == AttributeType.INT || d.getType() == AttributeType.DECIMAL)
                .map(AttributeDefinition::getKey)
                .collect(Collectors.toSet());

        Map<String, Object> cleaned = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : attrs.entrySet()) {
            String base = ListingSpecifications.rangeBaseKey(entry.getKey());
            if (base == null || numericKeys.contains(base)) {
                cleaned.put(entry.getKey(), entry.getValue());
            }
        }
        return new ListingFilter(filter.minPrice(), filter.maxPrice(),
                filter.priceNegotiable(), filter.search(), cleaned);
    }

    @Transactional(readOnly = true)
    public Page<Listing> findMine(UUID sellerId, Pageable pageable) {
        return listings.findBySellerIdAndStatusNot(sellerId, ListingStatus.DELETED, pageable);
    }

    @Transactional(readOnly = true)
    public Page<Listing> findLiked(UUID userId, Pageable pageable) {
        return listings.findLikedByUser(userId, pageable);
    }

    // ----- trade-service Kafka integration -----

    /**
     * Trade-service reports a completed trade — flip the listing to SOLD.
     * Idempotent so the {@code listing-sold} consumer can survive Kafka
     * redeliveries safely. Missing listings log a warning and return quietly.
     */
    @Transactional
    public void markSold(UUID listingId, UUID buyerId, java.time.Instant soldAt) {
        Listing listing = listings.findById(listingId).orElse(null);
        if (listing == null) {
            log.warn("markSold: listing {} not found (Kafka replay of pre-migration event?)", listingId);
            return;
        }
        if (listing.getStatus() == ListingStatus.SOLD) {
            log.debug("markSold: listing {} already SOLD, skipping", listingId);
            return;
        }
        if (listing.getStatus() == ListingStatus.DELETED) {
            log.warn("markSold: listing {} is DELETED — not overwriting with SOLD", listingId);
            return;
        }
        listing.setStatus(ListingStatus.SOLD);
        listing.setSoldAt(soldAt);
        listing.setSoldToUserId(buyerId);
        listings.save(listing);
        log.info("Listing marked SOLD: id={} buyerId={}", listingId, buyerId);
    }

    // ----- admin moderation -----

    /** All listings regardless of owner; optional status filter for the admin table. */
    @Transactional(readOnly = true)
    public Page<Listing> findForAdmin(ListingStatus status, Pageable pageable) {
        return status == null
                ? listings.findAll(pageable)
                : listings.findByStatus(status, pageable);
    }

    /** Moderation soft-delete — same status flip as {@link #delete} but skips the owner check. */
    @Transactional
    public Listing adminDelete(UUID id, UUID adminId) {
        Listing listing = listings.findById(id).orElseThrow(MarketplaceException::listingNotFound);
        listing.setStatus(ListingStatus.DELETED);
        Listing saved = listings.save(listing);
        events.listingDeleted(saved.getId(), saved.getSellerId(), ListingStatus.DELETED);
        log.info("Listing deleted by admin: id={} sellerId={} adminId={}",
                id, saved.getSellerId(), adminId);
        return saved;
    }

    /** Bring a SOLD/DELETED listing back to ACTIVE (e.g. after a mistaken takedown). */
    @Transactional
    public Listing adminRestore(UUID id, UUID adminId) {
        Listing listing = listings.findById(id).orElseThrow(MarketplaceException::listingNotFound);
        if (listing.getStatus() == ListingStatus.ACTIVE) {
            throw MarketplaceException.listingAlreadyActive();
        }
        listing.setStatus(ListingStatus.ACTIVE);
        Listing saved = listings.save(listing);
        events.listingUpdated(saved);
        log.info("Listing restored by admin: id={} sellerId={} adminId={}",
                id, saved.getSellerId(), adminId);
        return saved;
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
