package uz.efbazaar.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.auth.domain.TradeAdminApplication;
import uz.efbazaar.auth.domain.TradeAdminApplicationStatus;
import uz.efbazaar.auth.domain.User;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TradeAdminApplicationResponse(
        UUID id,
        UUID applicantUserId,
        String applicantName,
        String applicantEmail,
        String applicantTelegramUsername,
        TradeAdminApplicationStatus status,
        String reason,
        String contact,
        String decisionNote,
        UUID reviewerUserId,
        Instant createdAt,
        Instant reviewedAt
) {
    public static TradeAdminApplicationResponse of(TradeAdminApplication application, User applicant) {
        return new TradeAdminApplicationResponse(
                application.getId(),
                application.getApplicantUserId(),
                applicant == null ? null : applicant.displayName(),
                applicant == null ? null : applicant.getEmail(),
                applicant == null ? null : applicant.getTelegramUsername(),
                application.getStatus(),
                application.getReason(),
                application.getContact(),
                application.getDecisionNote(),
                application.getReviewerUserId(),
                application.getCreatedAt(),
                application.getReviewedAt()
        );
    }
}
