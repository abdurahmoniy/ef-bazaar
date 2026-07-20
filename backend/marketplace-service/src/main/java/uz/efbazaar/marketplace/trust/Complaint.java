package uz.efbazaar.marketplace.trust;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "complaints",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_complaints_context",
                columnNames = {"complainant_id", "context_type", "context_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Complaint {

    public enum ContextType { MATCH, TRADE, CHAT }

    public enum Category { LAG_BREAK, FRAUD, TOXIC, FAKE_RESULT }

    public enum Status { PENDING, CONFIRMED, REJECTED }

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "complainant_id", nullable = false)
    private UUID complainantId;

    @Column(name = "accused_id", nullable = false)
    private UUID accusedId;

    @Enumerated(EnumType.STRING)
    @Column(name = "context_type", nullable = false, length = 16)
    private ContextType contextType;

    @Column(name = "context_id", nullable = false, length = 64)
    private String contextId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Category category;

    @Column(columnDefinition = "TEXT")
    private String details;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "evidence_message_ids", columnDefinition = "text[]")
    @Builder.Default
    private List<String> evidenceMessageIds = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private Status status = Status.PENDING;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @PrePersist
    void onCreate() {
        createdAt = Instant.now();
        if (status == null) status = Status.PENDING;
    }
}
