package uz.efbazaar.marketplace.gamer;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Local projection of a user's tournament record, fed by Chempionat-X Kafka
 * events. Never written from request handlers — consumers only. The card
 * renders from this row even when the tournament service is down.
 */
@Entity
@Table(name = "gamer_stats")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GamerStats {

    public static final int STARTING_ELO = 1000;

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    @Builder.Default
    private int elo = STARTING_ELO;

    @Column(nullable = false)
    private int wins;

    @Column(nullable = false)
    private int draws;

    @Column(nullable = false)
    private int losses;

    @Column(name = "goals_for", nullable = false)
    private int goalsFor;

    @Column(name = "goals_against", nullable = false)
    private int goalsAgainst;

    @Column(name = "matches_count", nullable = false)
    private int matchesCount;

    @Column(nullable = false)
    private int tournaments;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public static GamerStats fresh(UUID userId) {
        return GamerStats.builder().userId(userId).build();
    }

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }
}
