package uz.efbazaar.marketplace.gamer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsMatchRepository;
import uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsRepository;
import uz.efbazaar.marketplace.gamer.TournamentEventDtos.EloUpdatedDto;
import uz.efbazaar.marketplace.gamer.TournamentEventDtos.MatchFinishedDto;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TournamentStatsConsumerTest {

    private static final UUID HOME = UUID.randomUUID();
    private static final UUID AWAY = UUID.randomUUID();

    @Mock private GamerStatsRepository stats;
    @Mock private GamerStatsMatchRepository ledger;

    private TournamentStatsConsumer consumer;
    private GamerStats homeRow;
    private GamerStats awayRow;

    @BeforeEach
    void setUp() {
        consumer = new TournamentStatsConsumer(stats, ledger);
        homeRow = GamerStats.fresh(HOME);
        awayRow = GamerStats.fresh(AWAY);
        lenient().when(stats.findWithLockByUserId(HOME)).thenReturn(Optional.of(homeRow));
        lenient().when(stats.findWithLockByUserId(AWAY)).thenReturn(Optional.of(awayRow));
        lenient().when(stats.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(ledger.existsById(any())).thenReturn(false);
        lenient().when(ledger.countDistinctTournaments(any())).thenReturn(1);
    }

    private MatchFinishedDto match(int homeScore, int awayScore, Integer hp, Integer ap) {
        return new MatchFinishedDto("match-9", 9L, 3L, HOME, AWAY, 101L, 102L,
                homeScore, awayScore, hp, ap, Instant.now());
    }

    @Test
    void winLossAndGoalsAreCounted() {
        consumer.onMatchFinished(match(3, 1, null, null));

        assertEquals(1, homeRow.getWins());
        assertEquals(3, homeRow.getGoalsFor());
        assertEquals(1, homeRow.getGoalsAgainst());
        assertEquals(1, awayRow.getLosses());
        assertEquals(1, homeRow.getTournaments());
    }

    @Test
    void penaltyDeciderTurnsDrawIntoWin() {
        consumer.onMatchFinished(match(2, 2, 4, 5));

        assertEquals(1, awayRow.getWins());
        assertEquals(1, homeRow.getLosses());
        assertEquals(0, homeRow.getDraws());
    }

    @Test
    void redeliveredMatchIsIgnoredViaLedger() {
        when(ledger.existsById(any())).thenReturn(true);

        consumer.onMatchFinished(match(1, 0, null, null));

        verify(stats, never()).save(any());
        verify(ledger, never()).save(any());
    }

    @Test
    void unbridgedSideIsSkipped() {
        MatchFinishedDto e = new MatchFinishedDto("match-9", 9L, 3L, HOME, null, 101L, 102L,
                0, 2, null, null, Instant.now());

        consumer.onMatchFinished(e);

        assertEquals(1, homeRow.getLosses());
        verify(stats, never()).findWithLockByUserId(AWAY);
    }

    @Test
    void eloUpdateIsLastWriteWins() {
        consumer.onEloUpdated(new EloUpdatedDto("elo-9-1", HOME, 101L, 1000, 1020, 9L, Instant.now()));

        assertEquals(1020, homeRow.getElo());
    }
}
