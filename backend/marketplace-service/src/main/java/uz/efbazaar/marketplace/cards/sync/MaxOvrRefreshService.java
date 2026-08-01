package uz.efbazaar.marketplace.cards.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import uz.efbazaar.marketplace.cards.CardType;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Refreshes {@code max_overall_rating} for every card we hold, from the efhub
 * player index.
 *
 * <p>Split out of {@link EfhubSyncService} because it is useful on its own: it
 * fetches one JSON document and runs a batched UPDATE, with no player-page
 * scraping and no 5s-per-card delay. {@link EfhubSyncService} calls the same
 * writer method during its daily run; this service backs the admin endpoint so
 * a backfill can be triggered without shell access to the server.
 */
@Service
public class MaxOvrRefreshService {

    private static final Logger log = LoggerFactory.getLogger(MaxOvrRefreshService.class);

    private final EfhubClient client;
    private final CardWriter writer;

    public MaxOvrRefreshService(EfhubClient client, CardWriter writer) {
        this.client = client;
        this.writer = writer;
    }

    public Result refresh() {
        List<EfhubClient.IndexEntry> index = client.fetchIndex();

        Map<Long, Integer> maxOvrById = new HashMap<>();
        for (EfhubClient.IndexEntry entry : index) {
            if (CardType.fromEfhubId(entry.id()) != null && entry.maxOvr() != null) {
                maxOvrById.put(entry.id(), entry.maxOvr());
            }
        }

        int changed = writer.updateMaxOverallRatings(maxOvrById);
        log.info("max-ovr refresh: index={} ours={} changed={}",
                index.size(), maxOvrById.size(), changed);
        return new Result(index.size(), maxOvrById.size(), changed);
    }

    /**
     * @param indexEntries rows in the efhub index
     * @param matched      index rows whose id belongs to one of our card tables
     * @param changed      rows whose stored value actually moved
     */
    public record Result(int indexEntries, int matched, int changed) {}
}
