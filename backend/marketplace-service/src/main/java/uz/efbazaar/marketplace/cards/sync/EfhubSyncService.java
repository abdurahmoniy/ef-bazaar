package uz.efbazaar.marketplace.cards.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import uz.efbazaar.marketplace.cards.CardType;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Daily efhub sync:
 *   1. Fetch full player index (~43k entries, single JSON request)
 *   2. Filter by our card type prefixes (89/88/1067)
 *   3. Diff against existing efhub_ids in our DB
 *   4. Scrape only the NEW IDs (5s delay each, browser UA)
 *   5. Upsert + publish Kafka event
 *
 * Re-entrancy is guarded with a non-blocking lock — concurrent runs return early.
 */
@Service
public class EfhubSyncService {

    private static final Logger log = LoggerFactory.getLogger(EfhubSyncService.class);

    private final EfhubClient client;
    private final PlayerPageParser parser;
    private final CardWriter writer;
    private final KafkaTemplate<String, Object> kafka;
    private final EfhubSyncProperties props;
    private final ReentrantLock lock = new ReentrantLock();

    public EfhubSyncService(EfhubClient client,
                            PlayerPageParser parser,
                            CardWriter writer,
                            KafkaTemplate<String, Object> kafka,
                            EfhubSyncProperties props) {
        this.client = client;
        this.parser = parser;
        this.writer = writer;
        this.kafka = kafka;
        this.props = props;
    }

    public SyncResult sync() {
        if (!lock.tryLock()) {
            log.info("efhub sync already running, skipping");
            return resultSkipped();
        }
        try {
            return doSync();
        } finally {
            lock.unlock();
        }
    }

    private SyncResult doSync() {
        List<EfhubClient.IndexEntry> index;
        try {
            index = client.fetchIndex();
        } catch (RuntimeException e) {
            log.warn("efhub index fetch failed: {}", e.toString());
            return resultIndexFail();
        }
        log.info("efhub index loaded: {} entries", index.size());

        Set<Long> ourPrefixed = new HashSet<>();
        for (EfhubClient.IndexEntry e : index) {
            if (CardType.fromEfhubId(e.id()) != null) {
                ourPrefixed.add(e.id());
            }
        }

        Set<Long> known = writer.findAllEfhubIds();
        List<Long> newIds = new ArrayList<>();
        for (Long id : ourPrefixed) {
            if (!known.contains(id)) {
                newIds.add(id);
            }
        }
        log.info("efhub diff: ours={} known={} new={}", ourPrefixed.size(), known.size(), newIds.size());

        if (newIds.isEmpty()) {
            return new SyncResult(0, 0, 0, false);
        }

        int limit = props.batchLimit();
        List<Long> toScrape = newIds.size() > limit ? newIds.subList(0, limit) : newIds;
        if (newIds.size() > limit) {
            log.warn("efhub: {} new cards exceed batch-limit {}, will scrape rest on next run", newIds.size(), limit);
        }

        List<CardsAddedEvent.Added> added = new ArrayList<>();
        int failures = 0;
        for (int i = 0; i < toScrape.size(); i++) {
            Long id = toScrape.get(i);
            try {
                if (scrapeOne(id, added)) {
                    // ok
                } else {
                    failures++;
                }
            } catch (RuntimeException e) {
                log.warn("efhub scrape failed: id={} err={}", id, e.toString());
                failures++;
            }
            if (i < toScrape.size() - 1) {
                if (!sleep(props.delayMs())) {
                    log.info("efhub sync interrupted at {}/{}, persisting partial result", i + 1, toScrape.size());
                    break;
                }
            }
        }

        if (!added.isEmpty()) {
            publish(added);
        }
        return new SyncResult(added.size(), failures, newIds.size(), false);
    }

    private boolean scrapeOne(long id, List<CardsAddedEvent.Added> added) {
        String html = client.fetchPlayerPage(id);
        ScrapedCard card = parser.parse(html, id);
        if (card == null) {
            log.warn("efhub: no-data for id={}", id);
            return false;
        }
        CardType prefixType = CardType.fromEfhubId(id);
        CardType actualType = CardType.fromPlayerType(card.playerType());
        if (actualType == null || actualType != prefixType) {
            log.warn("efhub: prefix/type mismatch id={} prefix={} playerType={}", id, prefixType, card.playerType());
            return false;
        }
        writer.upsert(card, actualType);
        added.add(new CardsAddedEvent.Added(id, actualType, card.name(), card.overallRating()));
        log.debug("efhub: upserted {} {} (ovr={})", actualType, card.name(), card.overallRating());
        return true;
    }

    private void publish(List<CardsAddedEvent.Added> added) {
        CardsAddedEvent event = new CardsAddedEvent(Instant.now(), added.size(), added);
        try {
            kafka.send(CardsAddedEvent.TOPIC, event);
            log.info("efhub: published {} to {}", added.size(), CardsAddedEvent.TOPIC);
        } catch (RuntimeException e) {
            log.warn("efhub: Kafka publish failed (cards already in DB): {}", e.toString());
        }
    }

    private static boolean sleep(long ms) {
        try {
            Thread.sleep(ms);
            return true;
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    public record SyncResult(int added, int failed, int totalNew, boolean skipped) {}

    private static SyncResult resultSkipped() { return new SyncResult(0, 0, 0, true); }
    private static SyncResult resultIndexFail() { return new SyncResult(0, 0, 0, false); }
}
