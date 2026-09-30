package uz.efbazaar.outbox.it;

import uz.efbazaar.outbox.SnapshotSource;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/** "Holat" xotirada: state.get(id) == null — entity yo'q (build bo'sh qaytaradi). */
public class TestSnapshotSource implements SnapshotSource {

    public static final String TOPIC = "it-snapshots";

    public record Snap(String id, String value, long version) {}

    public final Map<String, String> state = new ConcurrentHashMap<>();
    public final AtomicInteger builds = new AtomicInteger();

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
        String value = state.get(entityId);
        return value == null ? Optional.empty() : Optional.of(new Snap(entityId, value, version));
    }
}
