package uz.efbazaar.recommendation.dreamteam;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
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
import java.util.Map;
import java.util.UUID;

/**
 * A user's saved squad — the thing they filter accounts against.
 *
 * <p>Slots live in JSONB for the same reason {@code valuable_players} does:
 * each slot carries a full card snapshot, and pinning that to columns would
 * mean a migration every time the card shape moves. Empty slots are absent
 * from the array rather than stored as nulls.
 */
@Entity
@Table(name = "dream_teams")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DreamTeam {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(nullable = false, length = 16)
    @Builder.Default
    private String formation = "4-3-3";

    /** {@code [{"index":0,"position":"GK","w":1,"card":{…}}, …]} */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<Map<String, Object>> slots = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        this.updatedAt = Instant.now();
    }
}
