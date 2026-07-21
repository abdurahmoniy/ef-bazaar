package uz.efbazaar.marketplace.trust;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
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
@Table(name = "penalties")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Penalty {

    public enum Type { WARNING, TEMP_BLOCK, PERM_BLOCK }

    public enum Status { ACTIVE, EXPIRED, REVOKED }

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Type type;

    @Column(nullable = false, length = 128)
    private String reason;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "source_complaint_ids", columnDefinition = "uuid[]")
    @Builder.Default
    private List<UUID> sourceComplaintIds = new ArrayList<>();

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    /** Null = permanent. */
    @Column(name = "expires_at")
    private Instant expiresAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private Status status = Status.ACTIVE;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** A blocking penalty that is ACTIVE and not yet past its expiry. */
    public boolean blocksNow(Instant now) {
        return status == Status.ACTIVE
                && (type == Type.TEMP_BLOCK || type == Type.PERM_BLOCK)
                && (expiresAt == null || expiresAt.isAfter(now));
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
        if (startsAt == null) startsAt = now;
        if (status == null) status = Status.ACTIVE;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
