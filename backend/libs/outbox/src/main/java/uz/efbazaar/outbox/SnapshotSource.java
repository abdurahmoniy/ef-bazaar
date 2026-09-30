package uz.efbazaar.outbox;

import java.util.Optional;

/** Servis beradigan bean: belgilangan entity'ning hozirgi holatini quradi. */
public interface SnapshotSource {

    /** outbox_snapshot_pending.source qiymati, masalan "listing". */
    String source();

    String topic();

    /** Kafka kaliti; default — entityId. */
    default String key(String entityId) {
        return entityId;
    }

    /** Bo'sh bo'lsa hech narsa yuborilmaydi va belgi o'chiriladi. version — monoton. */
    Optional<Object> build(String entityId, long version);
}
