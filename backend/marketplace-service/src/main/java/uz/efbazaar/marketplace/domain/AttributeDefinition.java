package uz.efbazaar.marketplace.domain;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * Registry of dynamic listing attributes. See migration V5 for the invariants;
 * in particular {@code key} is immutable once a definition ships because
 * existing listing values reference it.
 */
@Entity
@Table(name = "attribute_definitions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttributeDefinition {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    /** Snake-case identifier. Immutable — listings reference it in their JSONB payload. */
    @Column(nullable = false, unique = true, updatable = false, length = 64)
    private String key;

    @Column(name = "label_uz", nullable = false, length = 255)
    private String labelUz;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private AttributeType type;

    @Column(nullable = false)
    @Builder.Default
    private boolean required = false;

    @Column(nullable = false)
    @Builder.Default
    private int position = 0;

    @Column(name = "group_key", length = 64)
    private String groupKey;

    /**
     * Free-form validation hints — {@code min}, {@code max}, {@code regex},
     * {@code options[]}, {@code item_max_length}. Interpreted per {@link #type}.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode constraints;

    /** Whether this attribute surfaces in filter/search endpoints. */
    @Column(nullable = false)
    @Builder.Default
    private boolean searchable = true;

    /** Soft delete — {@code false} hides from public listing but preserves historical values. */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
