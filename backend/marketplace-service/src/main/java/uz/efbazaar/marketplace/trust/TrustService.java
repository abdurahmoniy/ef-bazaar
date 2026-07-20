package uz.efbazaar.marketplace.trust;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.domain.NotificationType;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthNameClient;
import uz.efbazaar.marketplace.service.NotificationService;
import uz.efbazaar.marketplace.trust.TrustDtos.BlacklistEntryResponse;
import uz.efbazaar.marketplace.trust.TrustDtos.FileComplaintRequest;
import uz.efbazaar.marketplace.trust.TrustRepositories.BlacklistIdentifierRepository;
import uz.efbazaar.marketplace.trust.TrustRepositories.ComplaintRepository;
import uz.efbazaar.marketplace.trust.TrustRepositories.PenaltyRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Complaint intake + graduated penalty engine + public blacklist.
 *
 * <p>Engine (counted over CONFIRMED complaints against the accused):
 * 1 → WARNING notification; 3 → 7-day TEMP_BLOCK; 5+ → PERM_BLOCK.
 * False reporters are tracked symmetrically: the 3rd REJECTED complaint
 * earns the complainant a WARNING.
 *
 * <p>Blocking side effects: ACTIVE listings → BLOCKED (restored on
 * expiry/revoke), {@code user-blacklisted} Kafka event for Chempionat-X and
 * trade-service, notification to the user. All transitions are idempotent.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TrustService {

    static final int WARNING_AT = 1;
    static final int TEMP_BLOCK_AT = 3;
    static final int PERM_BLOCK_AT = 5;
    static final Duration TEMP_BLOCK_DURATION = Duration.ofDays(7);
    static final int FALSE_REPORT_WARNING_AT = 3;

    private final ComplaintRepository complaints;
    private final PenaltyRepository penalties;
    private final BlacklistIdentifierRepository identifiers;
    private final ListingRepository listings;
    private final NotificationService notifications;
    private final MarketplaceEventPublisher events;
    private final AuthNameClient authNames;

    // ---------------------------------------------------------------- intake

    @Transactional
    public Complaint fileComplaint(UUID complainantId, FileComplaintRequest request) {
        if (complainantId.equals(request.accusedId())) {
            throw new MarketplaceException(HttpStatus.BAD_REQUEST, "self_complaint",
                    "O'zingiz ustingizdan shikoyat qila olmaysiz");
        }
        try {
            return complaints.save(Complaint.builder()
                    .complainantId(complainantId)
                    .accusedId(request.accusedId())
                    .contextType(request.contextType())
                    .contextId(request.contextId())
                    .category(request.category())
                    .details(request.details())
                    .evidenceMessageIds(request.evidenceMessageIds() == null
                            ? List.of() : request.evidenceMessageIds())
                    .build());
        } catch (DataIntegrityViolationException e) {
            throw new MarketplaceException(HttpStatus.CONFLICT, "complaint_exists",
                    "Bu kontekst bo'yicha shikoyatingiz allaqachon mavjud");
        }
    }

    // ---------------------------------------------------------------- review

    @Transactional
    public Complaint confirm(UUID complaintId, UUID adminId) {
        Complaint complaint = pending(complaintId);
        complaint.setStatus(Complaint.Status.CONFIRMED);
        complaint.setReviewedBy(adminId);
        complaint.setReviewedAt(Instant.now());
        applyPenaltyLadder(complaint.getAccusedId(), adminId);
        return complaint;
    }

    @Transactional
    public Complaint reject(UUID complaintId, UUID adminId) {
        Complaint complaint = pending(complaintId);
        complaint.setStatus(Complaint.Status.REJECTED);
        complaint.setReviewedBy(adminId);
        complaint.setReviewedAt(Instant.now());

        long rejected = complaints.countByComplainantIdAndStatus(
                complaint.getComplainantId(), Complaint.Status.REJECTED);
        if (rejected == FALSE_REPORT_WARNING_AT) {
            notifications.trustNotice(complaint.getComplainantId(), NotificationType.TRUST_WARNING);
            log.info("False-report warning issued: user={} rejectedComplaints={}",
                    complaint.getComplainantId(), rejected);
        }
        return complaint;
    }

    private Complaint pending(UUID complaintId) {
        Complaint complaint = complaints.findById(complaintId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND,
                        "complaint_not_found", "Shikoyat topilmadi"));
        if (complaint.getStatus() != Complaint.Status.PENDING) {
            throw new MarketplaceException(HttpStatus.CONFLICT, "complaint_reviewed",
                    "Shikoyat allaqachon ko'rib chiqilgan");
        }
        return complaint;
    }

    // ---------------------------------------------------------------- engine

    private void applyPenaltyLadder(UUID accusedId, UUID adminId) {
        List<Complaint> confirmed =
                complaints.findByAccusedIdAndStatus(accusedId, Complaint.Status.CONFIRMED);
        long count = confirmed.size();
        List<UUID> sourceIds = confirmed.stream().map(Complaint::getId).toList();

        boolean alreadyPermBlocked = penalties
                .findByUserIdAndStatus(accusedId, Penalty.Status.ACTIVE).stream()
                .anyMatch(p -> p.getType() == Penalty.Type.PERM_BLOCK);
        if (alreadyPermBlocked) return;

        if (count >= PERM_BLOCK_AT) {
            issueBlock(accusedId, adminId, Penalty.Type.PERM_BLOCK, null, sourceIds,
                    count + " ta tasdiqlangan shikoyat — doimiy blok");
        } else if (count >= TEMP_BLOCK_AT && hasNoActiveBlock(accusedId)) {
            issueBlock(accusedId, adminId, Penalty.Type.TEMP_BLOCK,
                    Instant.now().plus(TEMP_BLOCK_DURATION), sourceIds,
                    count + " ta tasdiqlangan shikoyat — 7 kunlik blok");
        } else if (count >= WARNING_AT && count < TEMP_BLOCK_AT) {
            notifications.trustNotice(accusedId, NotificationType.TRUST_WARNING);
        }
    }

    private boolean hasNoActiveBlock(UUID userId) {
        Instant now = Instant.now();
        return penalties.findByUserIdAndStatus(userId, Penalty.Status.ACTIVE).stream()
                .noneMatch(p -> p.blocksNow(now));
    }

    private void issueBlock(UUID userId, UUID adminId, Penalty.Type type,
                            Instant expiresAt, List<UUID> sourceIds, String reason) {
        Penalty penalty = penalties.save(Penalty.builder()
                .userId(userId)
                .type(type)
                .reason(reason)
                .sourceComplaintIds(sourceIds)
                .expiresAt(expiresAt)
                .createdBy(adminId)
                .build());
        int hidden = listings.retagBySellerAndStatus(userId, ListingStatus.ACTIVE, ListingStatus.BLOCKED);
        notifications.trustNotice(userId, NotificationType.TRUST_BLOCKED);
        events.userBlacklisted(penalty.getId(), userId, type.name(), reason, expiresAt);
        log.info("User blocked: user={} type={} expiresAt={} listingsHidden={}",
                userId, type, expiresAt, hidden);
    }

    /** Called by the sweeper for TEMP blocks past their window. Idempotent. */
    @Transactional
    public void expirePenalty(UUID penaltyId) {
        penalties.findById(penaltyId)
                .filter(p -> p.getStatus() == Penalty.Status.ACTIVE)
                .ifPresent(p -> {
                    p.setStatus(Penalty.Status.EXPIRED);
                    restoreIfUnblocked(p, "expired", null);
                });
    }

    @Transactional
    public Penalty revokePenalty(UUID penaltyId, UUID adminId) {
        Penalty penalty = penalties.findById(penaltyId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND,
                        "penalty_not_found", "Jazo topilmadi"));
        if (penalty.getStatus() != Penalty.Status.ACTIVE) {
            throw new MarketplaceException(HttpStatus.CONFLICT, "penalty_not_active",
                    "Jazo aktiv emas");
        }
        penalty.setStatus(Penalty.Status.REVOKED);
        restoreIfUnblocked(penalty, "revoked", adminId);
        return penalty;
    }

    /** Shared by revoke and lazy TEMP expiry: restore listings + notify once no block remains. */
    private void restoreIfUnblocked(Penalty penalty, String cause, UUID actor) {
        if (penalty.getType() == Penalty.Type.WARNING) return;
        if (!hasNoActiveBlock(penalty.getUserId())) return;
        int restored = listings.retagBySellerAndStatus(
                penalty.getUserId(), ListingStatus.BLOCKED, ListingStatus.ACTIVE);
        notifications.trustNotice(penalty.getUserId(), NotificationType.TRUST_UNBLOCKED);
        events.userUnblacklisted(penalty.getId(), penalty.getUserId(), cause);
        log.info("User unblocked: user={} cause={} actor={} listingsRestored={}",
                penalty.getUserId(), cause, actor, restored);
    }

    @Transactional
    public List<BlacklistIdentifier> addIdentifiers(UUID penaltyId,
                                                    TrustDtos.AddIdentifiersRequest request) {
        Penalty penalty = penalties.findById(penaltyId)
                .orElseThrow(() -> new MarketplaceException(HttpStatus.NOT_FOUND,
                        "penalty_not_found", "Jazo topilmadi"));
        return identifiers.saveAll(request.identifiers().stream()
                .map(i -> BlacklistIdentifier.builder()
                        .penaltyId(penalty.getId())
                        .type(i.type())
                        .value(BlacklistIdentifier.normalize(i.type(), i.value()))
                        .build())
                .toList());
    }

    // ---------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public Page<Complaint> adminComplaints(Complaint.Status status, Pageable pageable) {
        return complaints.findByStatusOrderByCreatedAtDesc(
                status == null ? Complaint.Status.PENDING : status, pageable);
    }

    /** Identifier lookup for registration/tournament-join screening. */
    @Transactional(readOnly = true)
    public boolean identifierBlacklisted(BlacklistIdentifier.Type type, String rawValue) {
        String value = BlacklistIdentifier.normalize(type, rawValue);
        Instant now = Instant.now();
        return identifiers.findByTypeAndValue(type, value).stream()
                .map(BlacklistIdentifier::getPenaltyId)
                .map(penalties::findById)
                .anyMatch(p -> p.isPresent() && p.get().blocksNow(now));
    }

    @Transactional(readOnly = true)
    public Page<BlacklistEntryResponse> publicBlacklist(Pageable pageable) {
        Page<Penalty> page = penalties.findByStatusAndTypeInOrderByCreatedAtDesc(
                Penalty.Status.ACTIVE,
                List.of(Penalty.Type.TEMP_BLOCK, Penalty.Type.PERM_BLOCK),
                pageable);
        Map<UUID, String> names = authNames.resolveNames(
                page.getContent().stream().map(Penalty::getUserId).distinct().toList());
        Instant now = Instant.now();
        return page.map(p -> new BlacklistEntryResponse(
                p.getUserId(),
                names.get(p.getUserId()),
                p.getType().name(),
                p.getReason(),
                complaints.countByAccusedIdAndStatus(p.getUserId(), Complaint.Status.CONFIRMED),
                p.getStartsAt(),
                p.getExpiresAt(),
                p.blocksNow(now)));
    }
}
