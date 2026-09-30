package uz.efbazaar.outbox.it;

import uz.efbazaar.outbox.SnapshotSource;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** "Holat" xotirada: state.get(id) == null — entity yo'q (build bo'sh qaytaradi). */
public class TestSnapshotSource implements SnapshotSource {

    public static final String TOPIC = "it-snapshots";

    public record Snap(String id, String value, long version) {}

    public final Map<String, String> state = new ConcurrentHashMap<>();
    public final AtomicInteger builds = new AtomicInteger();

    private volatile String blockId;
    private volatile CountDownLatch entered = new CountDownLatch(0);
    private volatile CountDownLatch release = new CountDownLatch(0);

    /** Keyingi build(id) relay ichida to'xtaydi; qaytgan latch build'ga kirilganda ochiladi. */
    public CountDownLatch blockNextBuild(String id) {
        entered = new CountDownLatch(1);
        release = new CountDownLatch(1);
        blockId = id;
        return entered;
    }

    public void release() {
        release.countDown();
    }

    @Override
    public String source() {
        return "thing";
    }

    @Override
    public String topic() {
        return TOPIC;
    }

    @Override
    public String key(String entityId) {
        return "key-" + entityId;
    }

    @Override
    public Optional<Object> build(String entityId, long version) {
        builds.incrementAndGet();
        if (entityId.equals(blockId)) {
            blockId = null;
            entered.countDown();
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        String value = state.get(entityId);
        return value == null ? Optional.empty() : Optional.of(new Snap(entityId, value, version));
    }
}
