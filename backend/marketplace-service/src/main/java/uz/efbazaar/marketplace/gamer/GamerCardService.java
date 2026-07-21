package uz.efbazaar.marketplace.gamer;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.gamer.GamerCardDtos.GamerCardResponse;
import uz.efbazaar.marketplace.gamer.GamerCardDtos.ProfileUpdateRequest;
import uz.efbazaar.marketplace.gamer.GamerCardDtos.Tier;
import uz.efbazaar.marketplace.gamer.GamerRepositories.GamerProfileRepository;
import uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.trust.BlacklistGuard;

import java.util.Optional;
import java.util.UUID;

/**
 * Aggregates the Gamer Card from local sources only (auth identity is the one
 * remote call, and it is fail-soft): tournament projection (gamer_stats),
 * self-declared profile, and escrow/listing counters straight from listings.
 *
 * <p>404 semantics: a card exists iff auth-service knows the user OR we hold
 * any local trace (stats/profile/listings). A random UUID stays 404 so the
 * public endpoint can't be used to fish for valid ids via defaults.
 */
@Service
@RequiredArgsConstructor
public class GamerCardService {

    private final GamerStatsRepository stats;
    private final GamerProfileRepository profiles;
    private final ListingRepository listings;
    private final AuthSummaryClient authSummary;
    private final BlacklistGuard blacklistGuard;

    @Transactional(readOnly = true)
    public GamerCardResponse getCard(UUID userId) {
        Optional<AuthSummaryClient.UserSummary> summary = authSummary.resolve(userId);
        Optional<GamerStats> statsRow = stats.findById(userId);
        Optional<GamerProfile> profileRow = profiles.findById(userId);

        long active = listings.countBySellerIdAndStatus(userId, ListingStatus.ACTIVE);
        long sold = listings.countBySellerIdAndStatus(userId, ListingStatus.SOLD);
        long bought = listings.countBySoldToUserId(userId);

        boolean knownLocally = statsRow.isPresent() || profileRow.isPresent()
                || active > 0 || sold > 0 || bought > 0;
        if (summary.isEmpty() && !knownLocally) {
            throw new MarketplaceException(HttpStatus.NOT_FOUND, "gamer_not_found",
                    "O'yinchi topilmadi");
        }

        GamerStats s = statsRow.orElseGet(() -> GamerStats.fresh(userId));
        GamerProfile p = profileRow.orElse(null);
        Integer winRate = s.getMatchesCount() == 0
                ? null
                : (int) Math.round(100.0 * s.getWins() / s.getMatchesCount());

        return new GamerCardResponse(
                userId,
                summary.map(AuthSummaryClient.UserSummary::displayName).orElse(null),
                summary.map(AuthSummaryClient.UserSummary::telegramUsername).orElse(null),
                summary.map(AuthSummaryClient.UserSummary::verified).orElse(null),
                summary.map(AuthSummaryClient.UserSummary::createdAt).orElse(null),
                summary.map(AuthSummaryClient.UserSummary::photoAvailable).orElse(false),
                s.getElo(),
                Tier.fromElo(s.getElo()),
                s.getWins(), s.getDraws(), s.getLosses(),
                s.getMatchesCount(), s.getGoalsFor(), s.getGoalsAgainst(),
                winRate,
                s.getTournaments(),
                active, sold, bought,
                blacklistGuard.isBlacklisted(userId),
                p == null ? null : p.getBio(),
                p == null ? null : p.getPlatform(),
                p == null ? null : p.getHighestDivision(),
                p == null ? null : p.getFavoriteTeam());
    }

    @Transactional
    public GamerCardResponse updateProfile(UUID userId, ProfileUpdateRequest request) {
        GamerProfile profile = profiles.findById(userId)
                .orElseGet(() -> GamerProfile.builder().userId(userId).build());
        profile.setBio(request.bio());
        profile.setPlatform(request.platform());
        profile.setHighestDivision(request.highestDivision());
        profile.setFavoriteTeam(request.favoriteTeam());
        profiles.save(profile);
        return getCard(userId);
    }
}
