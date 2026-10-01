package uz.efbazaar.marketplace.recommendation;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;

import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Hamma e'lon, like va karta uchun snapshot belgisi — recommendation birinchi ishga tushganda
 * yoki qo'lda tuzatishda. Belgi o'zi yuborilmaydi — relay odatdagidek. Takror chaqirish zararsiz.
 */
@Slf4j
@Service
public class RecommendationReplayService {

    private static final int BATCH = 1000;

    private final JdbcTemplate jdbc;
    private final CardCatalogReader catalog;
    private final Outbox outbox;
    private final TransactionTemplate tx;

    public RecommendationReplayService(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc,
                                       CardCatalogReader catalog, Outbox outbox,
                                       PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.outbox = outbox;
        this.tx = new TransactionTemplate(txManager);
    }

    public record ReplayResult(int listings, int likes, int cards) {}

    public ReplayResult replay() {
        List<String> listings = jdbc.queryForList("SELECT id FROM listings ORDER BY id", UUID.class)
                .stream().map(UUID::toString).toList();
        List<String> likes = jdbc.query("SELECT user_id, listing_id FROM listing_likes ORDER BY listing_id, user_id",
                (rs, n) -> rs.getObject("user_id", UUID.class) + ":" + rs.getObject("listing_id", UUID.class));
        List<String> cards = catalog.allIds().stream().map(String::valueOf).toList();

        markAll(listings, id -> outbox.markSnapshot(RecommendationTopics.SOURCE_LISTING, id));
        markAll(likes, id -> outbox.markSnapshot(RecommendationTopics.SOURCE_LIKE, id));
        markAll(cards, id -> outbox.markSnapshot(RecommendationTopics.SOURCE_CARD, id));
        ReplayResult result = new ReplayResult(listings.size(), likes.size(), cards.size());
        log.info("recommendation replay: {}", result);
        return result;
    }

    private void markAll(List<String> ids, Consumer<String> mark) {
        for (int from = 0; from < ids.size(); from += BATCH) {
            List<String> batch = ids.subList(from, Math.min(from + BATCH, ids.size()));
            tx.executeWithoutResult(status -> batch.forEach(mark));
        }
    }
}
