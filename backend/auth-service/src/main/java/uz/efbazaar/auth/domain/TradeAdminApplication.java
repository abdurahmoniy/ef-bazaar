package uz.efbazaar.auth.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "trade_admin_applications",
        indexes = {
                @Index(name = "ix_taa_status_created", columnList = "status, created_at"),
                @Index(name = "ix_taa_applicant_created", columnList = "applicant_user_id, created_at")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TradeAdminApplication {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "applicant_user_id", columnDefinition = "uuid", nullable = false)
    private UUID applicantUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private TradeAdminApplicationStatus status = TradeAdminApplicationStatus.PENDING;

    @Column(nullable = false, length = 1000)
    private String reason;

    @Column(length = 255)
    private String contact;

    @Column(name = "decision_note", length = 500)
    private String decisionNote;

    @Column(name = "reviewer_user_id", columnDefinition = "uuid")
    private UUID reviewerUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (status == null) status = TradeAdminApplicationStatus.PENDING;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
