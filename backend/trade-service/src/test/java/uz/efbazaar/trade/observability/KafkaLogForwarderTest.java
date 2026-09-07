package uz.efbazaar.trade.observability;

import ch.qos.logback.classic.Logger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;
import java.util.concurrent.Executor;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * The forwarder has to survive the kind of failure it exists to report.
 */
class KafkaLogForwarderTest {

    private static final String TOPIC = "efbazaar.system.log-event";

    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, Object> template = mock(KafkaTemplate.class);
    private final org.slf4j.Logger caller = LoggerFactory.getLogger("uz.efbazaar.trade.TestCaller");

    private KafkaLogForwarder attach() {
        KafkaLogForwarder forwarder = new KafkaLogForwarder(template);
        ReflectionTestUtils.setField(forwarder, "enabled", true);
        // Uzatish produksiyada alohida threadда ketadi, aks holda Kafka
        // sekinlashuvi log yozgan threadni bloklardi. Testda uni shu yerda
        // bajaramiz — tekshirilayotgan narsa qaysi thread emas, NIMA
        // yuborilgani.
        ReflectionTestUtils.setField(forwarder, "publishExecutor", (Executor) Runnable::run);
        forwarder.register();
        return forwarder;
    }

    @AfterEach
    void detach() {
        // The appender goes on the ROOT logger, which outlives the test.
        ((Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME))
                .detachAppender("kafka-log-forwarder");
    }

    @Test
    @DisplayName("the same failure repeating with different ids is forwarded once")
    void aLoopIsForwardedOnce() {
        attach();
        IllegalStateException boom = new IllegalStateException("stuck");

        // A retry loop logs the same fault over and over, and the message
        // almost always carries something unique — a trade id here. Keying the
        // dedup on the message would make every line "new" and forward all of
        // them, which is the flood we are guarding against.
        for (int i = 0; i < 50; i++) {
            caller.error("savdo {} qayta ishlanmadi", UUID.randomUUID(), boom);
        }

        verify(template, times(1)).send(eq(TOPIC), eq("trade-service"), any(LogEvent.class));
    }

    @Test
    @DisplayName("INFO is not forwarded; WARN and ERROR are")
    void onlyProblemsAreForwarded() {
        attach();

        caller.info("odatiy ish");
        caller.warn("shubhali");
        caller.error("yiqildi");

        // Distinct throttle keys (no throwable → the level is the key), so both
        // problems get through and the INFO does not.
        verify(template, times(2)).send(eq(TOPIC), eq("trade-service"), any(LogEvent.class));
    }
}
