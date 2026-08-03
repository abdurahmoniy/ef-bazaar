package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.dto.TradeAdminCardResponse;
import uz.efbazaar.trade.admin.presence.PresenceQuery;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.security.AuthSummaryClient;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The hire-an-admin list.
 *
 * <p>Admin count is small (tens), so this resolves names for every candidate
 * and filters by name in memory rather than adding a search endpoint to
 * auth-service. If the population ever reaches thousands this is the first
 * thing to revisit.
 */
@Service
@RequiredArgsConstructor
public class TradeAdminCatalogService {

    /** Ordering options offered to the seller. */
    public enum CatalogSort {
        /** Online first, then rating, then speed. */
        DEFAULT,
        RATING,
        /** Fastest average work time first; unrated/unmeasured last. */
        SPEED,
        FEE_ASC
    }

    private final TradeAdminProfileRepository profiles;
    private final TradeRepository trades;
    private final AuthSummaryClient authSummaries;
    private final PresenceQuery presence;

    @Transactional(readOnly = true)
    public List<TradeAdminCardResponse> search(String q, CatalogSort sort) {
        List<TradeAdminProfile> candidates = profiles.findByActiveTrueAndAcceptingOrdersTrue();
        if (candidates.isEmpty()) return List.of();

        List<UUID> ids = candidates.stream().map(TradeAdminProfile::getUserId).toList();
        Map<UUID, AuthSummaryClient.UserSummary> names = authSummaries.resolveAll(ids);
        Map<UUID, PresenceQuery.Presence> online = presence.of(ids);

        List<TradeAdminCardResponse> cards = candidates.stream()
                .map(p -> TradeAdminCardResponse.of(
                        p,
                        names.get(p.getUserId()),
                        online.get(p.getUserId()),
                        trades.countActiveByAdmin(p.getUserId())))
                .filter(c -> matches(c, q))
                .sorted(comparator(sort))
                .toList();

        return cards;
    }

    /**
     * Name search. A candidate whose name auth-service could not resolve is
     * kept when the query is blank and dropped otherwise — matching on a name
     * we do not have is not possible, and silently keeping it would look like
     * a broken filter.
     */
    private boolean matches(TradeAdminCardResponse c, String q) {
        if (q == null || q.isBlank()) return true;
        String needle = q.trim().toLowerCase();
        return c.displayName() != null && c.displayName().toLowerCase().contains(needle);
    }

    private Comparator<TradeAdminCardResponse> comparator(CatalogSort sort) {
        Comparator<TradeAdminCardResponse> byRating =
                Comparator.comparing(TradeAdminCardResponse::averageStars,
                        Comparator.nullsLast(Comparator.reverseOrder()));
        Comparator<TradeAdminCardResponse> bySpeed =
                Comparator.comparing(TradeAdminCardResponse::averageWorkSeconds,
                        Comparator.nullsLast(Comparator.naturalOrder()));
        Comparator<TradeAdminCardResponse> byFee =
                Comparator.comparingLong(TradeAdminCardResponse::minFeeUzs);
        Comparator<TradeAdminCardResponse> onlineFirst =
                Comparator.comparing(TradeAdminCardResponse::online).reversed();
        Comparator<TradeAdminCardResponse> freeFirst =
                Comparator.comparing(TradeAdminCardResponse::busy);

        return switch (sort) {
            case RATING  -> byRating.thenComparing(bySpeed);
            case SPEED   -> bySpeed.thenComparing(byRating);
            case FEE_ASC -> byFee.thenComparing(byRating);
            case DEFAULT -> freeFirst.thenComparing(onlineFirst)
                                     .thenComparing(byRating)
                                     .thenComparing(bySpeed);
        };
    }
}
