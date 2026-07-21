package uz.efbazaar.marketplace.gamer;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.UUID;

/**
 * Idempotency ledger for consumed match-finished events: one row per
 * (user, match) proves that match already counted toward the user's W/D/L.
 * Also carries the tournament id so the distinct-tournament counter can be
 * recomputed from local data.
 */
@Entity
@Table(name = "gamer_stats_matches")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class GamerStatsMatch {

    @EmbeddedId
    private Key key;

    @Column(name = "tournament_id")
    private Long tournamentId;

    public GamerStatsMatch(UUID userId, Long matchId, Long tournamentId) {
        this.key = new Key(userId, matchId);
        this.tournamentId = tournamentId;
    }

    @Embeddable
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {

        @Column(name = "user_id")
        private UUID userId;

        @Column(name = "match_id")
        private Long matchId;
    }
}
