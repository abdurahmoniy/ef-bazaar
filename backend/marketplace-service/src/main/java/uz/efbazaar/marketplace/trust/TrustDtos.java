package uz.efbazaar.marketplace.trust;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TrustDtos {

    private TrustDtos() {}

    public record FileComplaintRequest(
            @NotNull UUID accusedId,
            @NotNull Complaint.ContextType contextType,
            @NotBlank @Size(max = 64) String contextId,
            @NotNull Complaint.Category category,
            @Size(max = 2000) String details,
            @Size(max = 10) List<String> evidenceMessageIds
    ) {}

    public record ComplaintResponse(
            UUID id,
            UUID complainantId,
            UUID accusedId,
            Complaint.ContextType contextType,
            String contextId,
            Complaint.Category category,
            String details,
            List<String> evidenceMessageIds,
            Complaint.Status status,
            Instant createdAt,
            Instant reviewedAt
    ) {
        public static ComplaintResponse from(Complaint c) {
            return new ComplaintResponse(c.getId(), c.getComplainantId(), c.getAccusedId(),
                    c.getContextType(), c.getContextId(), c.getCategory(), c.getDetails(),
                    c.getEvidenceMessageIds(), c.getStatus(), c.getCreatedAt(), c.getReviewedAt());
        }
    }

    /** Public row — no evidence, no complainant identity (doxxing surface). */
    public record BlacklistEntryResponse(
            UUID userId,
            String displayName,
            String penaltyType,
            String reason,
            long confirmedComplaints,
            Instant since,
            Instant expiresAt,
            boolean active
    ) {}

    public record AddIdentifiersRequest(
            @NotNull @Size(min = 1, max = 10) List<IdentifierItem> identifiers
    ) {
        public record IdentifierItem(
                @NotNull BlacklistIdentifier.Type type,
                @NotBlank @Size(max = 128) String value) {}
    }

    public record PenaltyResponse(
            UUID id,
            UUID userId,
            Penalty.Type type,
            String reason,
            Penalty.Status status,
            Instant startsAt,
            Instant expiresAt
    ) {
        public static PenaltyResponse from(Penalty p) {
            return new PenaltyResponse(p.getId(), p.getUserId(), p.getType(), p.getReason(),
                    p.getStatus(), p.getStartsAt(), p.getExpiresAt());
        }
    }
}
