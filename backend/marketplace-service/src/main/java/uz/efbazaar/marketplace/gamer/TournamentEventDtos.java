package uz.efbazaar.marketplace.gamer;

import java.time.Instant;
import java.util.UUID;

/**
 * Payload mirrors of Chempionat-X's EfbazaarTournamentEventPublisher records.
 * Contract: docs/superpowers/plans/2026-07-15-chempionat-x-gamer-card-blacklist.md.
 * {@code authUserId} fields are null when the player is not bridged to an
 * efBazaar account — those sides are simply skipped by the consumers.
 */
public final class TournamentEventDtos {

    private TournamentEventDtos() {}

    public record EloUpdatedDto(
            String idempotencyKey,
            UUID authUserId,
            Long telegramId,
            int oldElo,
            int newElo,
            Long matchId,
            Instant occurredAt) {}

    public record MatchFinishedDto(
            String idempotencyKey,
            Long matchId,
            Long tournamentId,
            UUID homeAuthUserId,
            UUID awayAuthUserId,
            Long homeTelegramId,
            Long awayTelegramId,
            Integer homeScore,
            Integer awayScore,
            Integer homePenaltyScore,
            Integer awayPenaltyScore,
            Instant occurredAt) {}
}
