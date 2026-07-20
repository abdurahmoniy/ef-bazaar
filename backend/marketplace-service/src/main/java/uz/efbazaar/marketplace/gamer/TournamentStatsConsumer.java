package uz.efbazaar.marketplace.gamer;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsMatchRepository;
import uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsRepository;
import uz.efbazaar.marketplace.gamer.TournamentEventDtos.EloUpdatedDto;
import uz.efbazaar.marketplace.gamer.TournamentEventDtos.MatchFinishedDto;

import java.util.UUID;

/**
 * Projects Chempionat-X tournament events into {@code gamer_stats}.
 *
 * <p>Idempotency: match events are guarded by the (user, match) ledger —
 * Kafka redelivery is a no-op. ELO updates are last-write-wins (each event
 * carries the absolute new value, not a delta, so replays converge).
 * Unbridged players (null authUserId) are skipped — their stats live only in
 * Chempionat-X until they register on efBazaar.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TournamentStatsConsumer {

    private final GamerStatsRepository stats;
    private final GamerStatsMatchRepository ledger;

    @KafkaListener(
            topics = "efbazaar.tournament.elo-updated",
            groupId = "marketplace-gamer-elo",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.gamer.TournamentEventDtos$EloUpdatedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onEloUpdated(EloUpdatedDto e) {
        if (e.authUserId() == null) return;
        GamerStats row = stats.findWithLockByUserId(e.authUserId())
                .orElseGet(() -> GamerStats.fresh(e.authUserId()));
        row.setElo(e.newElo());
        stats.save(row);
        log.debug("gamer_stats elo: user={} {}→{}", e.authUserId(), e.oldElo(), e.newElo());
    }

    @KafkaListener(
            topics = "efbazaar.tournament.match-finished",
            groupId = "marketplace-gamer-match",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.gamer.TournamentEventDtos$MatchFinishedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onMatchFinished(MatchFinishedDto e) {
        boolean penalties = e.homePenaltyScore() != null && e.awayPenaltyScore() != null
                && e.homeScore().equals(e.awayScore());
        double homeS;
        if (!e.homeScore().equals(e.awayScore())) {
            homeS = e.homeScore() > e.awayScore() ? 1.0 : 0.0;
        } else if (penalties) {
            homeS = e.homePenaltyScore() > e.awayPenaltyScore() ? 1.0 : 0.0;
        } else {
            homeS = 0.5;
        }
        applySide(e.homeAuthUserId(), e, homeS, e.homeScore(), e.awayScore());
        applySide(e.awayAuthUserId(), e, 1.0 - homeS, e.awayScore(), e.homeScore());
    }

    private void applySide(UUID userId, MatchFinishedDto e, double s, int goalsFor, int goalsAgainst) {
        if (userId == null) return;
        if (ledger.existsById(new GamerStatsMatch.Key(userId, e.matchId()))) {
            log.debug("match {} already counted for user {}", e.matchId(), userId);
            return;
        }
        GamerStats row = stats.findWithLockByUserId(userId)
                .orElseGet(() -> GamerStats.fresh(userId));
        row.setMatchesCount(row.getMatchesCount() + 1);
        row.setGoalsFor(row.getGoalsFor() + goalsFor);
        row.setGoalsAgainst(row.getGoalsAgainst() + goalsAgainst);
        if (s == 1.0) row.setWins(row.getWins() + 1);
        else if (s == 0.0) row.setLosses(row.getLosses() + 1);
        else row.setDraws(row.getDraws() + 1);

        ledger.save(new GamerStatsMatch(userId, e.matchId(), e.tournamentId()));
        row.setTournaments(ledger.countDistinctTournaments(userId));
        stats.save(row);
    }
}
