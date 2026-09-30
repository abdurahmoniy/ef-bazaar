package uz.efbazaar.outbox.internal;

import org.apache.kafka.common.errors.InvalidTopicException;
import org.apache.kafka.common.errors.RecordTooLargeException;
import org.apache.kafka.common.errors.SerializationException;
import org.apache.kafka.common.errors.TopicAuthorizationException;

import java.util.List;

/**
 * Kafka hech qachon qabul qilmaydigan xatolar — qayta urinish foyda bermaydi, faqat navbatni
 * to'sadi. Ro'yxat ataylab tor: vaqtinchalik xatoni (broker o'chiq, timeout) doimiy deb
 * adashtirish uzoq nosozlikda butun navbatni park qilib yuborardi.
 */
public final class PermanentFailures {

    private static final List<Class<? extends Throwable>> PERMANENT = List.of(
            RecordTooLargeException.class,
            InvalidTopicException.class,
            TopicAuthorizationException.class,
            SerializationException.class);

    private PermanentFailures() {
    }

    /** Sabablar zanjirida (KafkaProducerException, ExecutionException o'ramlari ichida) qidiradi. */
    public static boolean isPermanent(Throwable error) {
        for (Throwable t = error; t != null; t = t.getCause() == t ? null : t.getCause()) {
            for (Class<? extends Throwable> type : PERMANENT) {
                if (type.isInstance(t)) {
                    return true;
                }
            }
        }
        return false;
    }
}
