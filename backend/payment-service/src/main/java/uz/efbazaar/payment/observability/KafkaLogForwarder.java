package uz.efbazaar.payment.observability;

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
 * Pushes WARN/ERROR Logback events to {@code efbazaar.system.log-event}, which
 * the bot forwards to the Telegram logs topic.
 *
 * <p>auth-service and marketplace-service have carried this for a while;
 * payment-service did not. Money moves through here, so a failure nobody is
 * told about is the worst version of this gap — trade-service showed how it
 * goes on 2026-09-07, running a Kafka retry loop unseen for hours while the
 * container reported healthy throughout.
 *
 * <p>Unlike those two, this one throttles. That same incident wrote 669,000
 * lines a minute: forwarded verbatim it would have put 11,000 records a second
 * into a 420 MB broker and 11,000 messages a second at a Telegram group that
 * accepts about 30, killing the channel precisely when it had something to
 * say. {@link LogThrottle} collapses repeats and caps the rate, and reports
 * how much it dropped so a flood reads as a flood rather than as silence.
 */
@Configuration
@RequiredArgsConstructor
public class KafkaLogForwarder {

    private static final String LOG_TOPIC = "efbazaar.system.log-event";
    private static final String SERVICE_NAME = "payment-service";

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final LogThrottle throttle = new LogThrottle();

    /**
     * Uzatish CHAQIRUVCHI THREADDA bo'lmaydi.
     *
     * <p>Broker yo'q yoki sekin bo'lsa `KafkaTemplate.send` metadata kutib
     * `max.block.ms` (default 60s) gacha bloklaydi. Log yozgan thread esa
     * so'rovni bajarayotgan thread bo'lishi mumkin — ya'ni Kafka yiqilishi
     * ilovani muzlatardi. CI'da aynan shu bo'ldi: kontekst ko'tarilishidagi
     * bir necha WARN har biri 60 soniya turdi.
     *
     * <p>Navbat chegaralangan va to'lganda yangi yozuv TASHLANADI: xabar
     * berish uchun xotira yeb qo'yish, keyin OOM bilan yiqilish — davosi
     * dardidan yomon.
     */
    private java.util.concurrent.Executor publishExecutor =
            new java.util.concurrent.ThreadPoolExecutor(
                    1, 1, 0L, java.util.concurrent.TimeUnit.MILLISECONDS,
                    new java.util.concurrent.ArrayBlockingQueue<>(500),
                    r -> {
                        Thread t = new Thread(r, "kafka-log-forwarder");
                        t.setDaemon(true);
                        return t;
                    },
                    new java.util.concurrent.ThreadPoolExecutor.DiscardPolicy());

    @Value("${app.logging.kafka-forward.enabled:true}")
    private boolean enabled;

    @PostConstruct
    public void register() {
        if (!enabled) return;

        Logger rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);

        // UnsynchronizedAppenderBase — AppenderBase.doAppend is synchronized, and
        // KafkaProducer.send blocking on metadata while the producer's own network
        // thread wants to log deadlocks on that lock.
        var appender = new UnsynchronizedAppenderBase<ILoggingEvent>() {
            private final AtomicBoolean publishing = new AtomicBoolean(false);
            private final ConcurrentLinkedQueue<ILoggingEvent> reentry = new ConcurrentLinkedQueue<>();

            @Override
            protected void append(ILoggingEvent event) {
                // Kafka's own logging would feed itself: publishing a record logs,
                // which publishes a record.
                if (event.getLoggerName().startsWith("org.apache.kafka")
                        || event.getLoggerName().startsWith("org.springframework.kafka")) {
                    return;
                }
                if (event.getLevel().toInt() < Level.WARN_INT) return;
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
            LogThrottle.Verdict verdict = throttle.admit(throttleKey(event));
            if (verdict.suppressed() > 0) {
                send(new LogEvent(SERVICE_NAME, "WARN", "LogThrottle",
                        event.getThreadName(),
                        "Oldingi daqiqada " + verdict.suppressed()
                                + " ta log xabari bostirildi (takror yoki chegara). "
                                + "To'liq ko'rinish uchun Grafana/Loki.",
                        null, Instant.ofEpochMilli(event.getTimeStamp())));
            }
            if (!verdict.send()) return;
            send(new LogEvent(
                    SERVICE_NAME,
                    event.getLevel().toString(),
                    event.getLoggerName(),
                    event.getThreadName(),
                    event.getFormattedMessage(),
                    stackTrace(event.getThrowableProxy()),
                    Instant.ofEpochMilli(event.getTimeStamp())
            ));
        } catch (Exception ignored) {
            // Never let reporting a problem become a second problem.
        }
    }

    private void send(LogEvent payload) {
        publishExecutor.execute(() -> {
            try {
                kafkaTemplate.send(LOG_TOPIC, SERVICE_NAME, payload);
            } catch (Exception ignored) {
                // Xabar berish ikkinchi muammoga aylanmasin.
            }
        });
    }

    /**
     * What counts as "the same error again": who logged it and what was thrown.
     *
     * <p>Deliberately not the formatted message — that usually carries a trade
     * id or an address, which would make every repeat unique and defeat the
     * dedup exactly during the loop it exists to survive.
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
