package uz.efbazaar.marketplace.cards.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import uz.efbazaar.marketplace.cards.CardType;
import uz.efbazaar.marketplace.observability.NotifyMarker;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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
        Map<Long, Integer> maxOvrById = new HashMap<>();
        for (EfhubClient.IndexEntry e : index) {
            if (CardType.fromEfhubId(e.id()) != null) {
                ourPrefixed.add(e.id());
                if (e.maxOvr() != null) {
                    maxOvrById.put(e.id(), e.maxOvr());
                }
            }
        }

        // Refresh maxed OVR on cards we already hold. It lives only in the
        // index, so cards scraped before the column existed would otherwise
        // stay null forever — no page fetch can fill it.
        int ovrChanged = writer.updateMaxOverallRatings(maxOvrById);
        if (ovrChanged > 0) {
            log.info("efhub: refreshed max_overall_rating on {} cards", ovrChanged);
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
            notifyRun(List.of(), 0, 0);
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
                if (scrapeOne(id, maxOvrById.get(id), added)) {
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
        notifyRun(added, failures, newIds.size());
        return new SyncResult(added.size(), failures, newIds.size(), false);
    }

    /**
     * Daily heartbeat + summary to the Telegram log channel (via the NOTIFY marker,
     * so it is forwarded even though it is INFO level). Lists who was added.
     */
    private void notifyRun(List<CardsAddedEvent.Added> added, int failures, int totalNew) {
        StringBuilder sb = new StringBuilder("Card sync bajarildi\n");
        sb.append("Yangi qo'shildi: ").append(added.size());
        if (failures > 0) {
            sb.append(" | Xato: ").append(failures);
        }
        int remaining = totalNew - added.size() - failures;
        if (remaining > 0) {
            sb.append(" | Qoldi (keyingi run): ").append(remaining);
        }
        if (added.isEmpty()) {
            sb.append("\nYangi card topilmadi.");
        } else {
            int show = Math.min(added.size(), 30);
            for (int i = 0; i < show; i++) {
                CardsAddedEvent.Added a = added.get(i);
                sb.append("\n• ").append(a.type()).append(' ').append(a.name());
                if (a.overallRating() != null) {
                    sb.append(" (").append(a.overallRating()).append(')');
                }
            }
            if (added.size() > show) {
                sb.append("\n… va yana ").append(added.size() - show).append(" ta");
            }
        }
        log.info(NotifyMarker.NOTIFY, sb.toString());
    }

    private boolean scrapeOne(long id, Integer maxOvr, List<CardsAddedEvent.Added> added) {
        String html = client.fetchPlayerPage(id);
        ScrapedCard card = parser.parse(html, id, maxOvr);
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
