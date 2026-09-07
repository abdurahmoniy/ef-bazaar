package uz.efbazaar.auth.observability;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.UnsynchronizedAppenderBase;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;

import java.time.Instant;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Pushes WARN/ERROR Logback events to the {@code efbazaar.system.log-event}
 * Kafka topic. Bot consumes and forwards to the Telegram logs topic.
 *
 * <p>Re-entrancy guard prevents infinite loops if Kafka publish itself logs at WARN/ERROR.
 */
@Configuration
@RequiredArgsConstructor
public class KafkaLogForwarder {

    private static final String LOG_TOPIC = "efbazaar.system.log-event";
    private static final String SERVICE_NAME = "auth-service";

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final LogThrottle throttle = new LogThrottle();

    @Value("${app.logging.kafka-forward.enabled:true}")
    private boolean enabled;

    @PostConstruct
    public void register() {
        if (!enabled) return;

        Logger rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);

        // UnsynchronizedAppenderBase — ThreadLocal guard, sync lock yo'q.
        // AppenderBase.doAppend (synchronized) ishlatsak, KafkaProducer.send metadata
        // kutayotganda kafka producer network thread'i o'sha lock'ni kutib deadlock bo'ladi.
        var appender = new UnsynchronizedAppenderBase<ILoggingEvent>() {
            private final AtomicBoolean publishing = new AtomicBoolean(false);
            private final ConcurrentLinkedQueue<ILoggingEvent> reentry = new ConcurrentLinkedQueue<>();

            @Override
            protected void append(ILoggingEvent event) {
                if (event.getLevel().toInt() < Level.WARN_INT) return;
                if (event.getLoggerName().startsWith("org.apache.kafka")
                        || event.getLoggerName().startsWith("org.springframework.kafka")) {
                    return; // avoid feedback loop
                }
                if (!publishing.compareAndSet(false, true)) {
                    reentry.offer(event);
                    return;
                }
                try {
                    publish(event);
                    ILoggingEvent buffered;
                    while ((buffered = reentry.poll()) != null) {
                        publish(buffered);
                    }
                } finally {
                    publishing.set(false);
                }
            }
        };
        appender.setName("kafka-log-forwarder");
        appender.setContext(rootLogger.getLoggerContext());
        appender.start();
        rootLogger.addAppender(appender);
    }

    private void publish(ILoggingEvent event) {
        try {
            LogEvent payload = new LogEvent(
                    SERVICE_NAME,
                    event.getLevel().toString(),
                    event.getLoggerName(),
                    event.getThreadName(),
                    event.getFormattedMessage(),
                    stackTrace(event.getThrowableProxy()),
                    Instant.ofEpochMilli(event.getTimeStamp())
            );
            LogThrottle.Verdict verdict = throttle.admit(throttleKey(event));
            if (verdict.suppressed() > 0) {
                kafkaTemplate.send(LOG_TOPIC, SERVICE_NAME, new LogEvent(
                        SERVICE_NAME, "WARN", "LogThrottle", event.getThreadName(),
                        "Oldingi daqiqada " + verdict.suppressed()
                                + " ta log xabari bostirildi (takror yoki chegara). "
                                + "To'liq ko'rinish uchun Grafana/Loki.",
                        null, Instant.ofEpochMilli(event.getTimeStamp())));
            }
            if (!verdict.send()) return;
            kafkaTemplate.send(LOG_TOPIC, SERVICE_NAME, payload);
        } catch (Exception ignored) {
            // Swallow — never let logging break the app.
        }
    }

    /**
     * What counts as "the same error again": who logged it and what was thrown.
     *
     * <p>Deliberately not the formatted message — that usually carries an id,
     * which would make every repeat unique and defeat the dedup exactly during
     * the loop it exists to survive.
     */
    private static String throttleKey(ILoggingEvent event) {
        IThrowableProxy thrown = event.getThrowableProxy();
        return event.getLoggerName() + "|"
                + (thrown != null ? thrown.getClassName() : event.getLevel().toString());
    }

    private static String stackTrace(IThrowableProxy proxy) {
        if (proxy == null) return null;
        return ThrowableProxyUtil.asString(proxy);
    }
}
