package uz.efbazaar.marketplace.gamer;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class GamerCardDtos {

    private GamerCardDtos() {}

    /** Tier is derived from ELO, never stored. */
    public enum Tier {
        BRONZE, SILVER, GOLD, ELITE, LEGEND;

        public static Tier fromElo(int elo) {
            if (elo >= 1600) return LEGEND;
            if (elo >= 1400) return ELITE;
            if (elo >= 1200) return GOLD;
            if (elo >= 1000) return SILVER;
            return BRONZE;
        }
    }

    public record GamerCardResponse(
            UUID userId,
            // identity (null-safe: auth-service may be unreachable)
            String displayName,
            String telegramUsername,
            Boolean verified,
            Instant memberSince,
            boolean photoAvailable,
            // competitive
            int elo,
            Tier tier,
            int wins,
            int draws,
            int losses,
            int matchesCount,
            int goalsFor,
            int goalsAgainst,
            Integer winRatePercent,
            int tournaments,
            // marketplace trust
            long activeListings,
            long soldListings,
            long escrowPurchases,
            boolean blacklisted,
            // self-declared profile
            String bio,
            GamerProfile.Platform platform,
            Integer highestDivision,
            String favoriteTeam
    ) {}

    public record ProfileUpdateRequest(
            @Size(max = 280) String bio,
            GamerProfile.Platform platform,
            @Min(1) @Max(9) Integer highestDivision,
            @Size(max = 64) String favoriteTeam
    ) {}
}
