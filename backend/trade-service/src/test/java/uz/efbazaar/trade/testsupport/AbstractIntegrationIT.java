package uz.efbazaar.trade.testsupport;

import org.springframework.test.context.DynamicPropertyRegistry;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Full-stack test base: Postgres (from parent) + Kafka + Redis.
 * Use this whenever a test touches Kafka topics, Redis keys, or scheduled jobs.
 */
public abstract class AbstractIntegrationIT extends AbstractPostgresIT {

    protected static final KafkaContainer KAFKA =
            new KafkaContainer(DockerImageName.parse("apache/kafka:3.7.0"))
                    .withReuse(true);

    protected static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                    .withExposedPorts(6379)
                    .withReuse(true);

    static {
        KAFKA.start();
        REDIS.start();
    }

    /**
     * Savdoni INITIATED dan chiqaradi — kim ulgursa o'sha.
     *
     * <p>Test profilida MockWorker {@code email-provision-request} ga o'zi
     * javob beradi va savdoni WAITING_PAYMENT ga olib o'tadi. Test ham o'sha
     * hodisani qo'lda yuborsa, ikkisi POYGAGA tushadi: sekin yugurishda (CI)
     * worker oldin ulguradi va qo'lda yuborilgan hodisa "Illegal event
     * MAILBOX_PROVISIONED from state WAITING_PAYMENT" bilan yiqiladi.
     *
     * <p>ATAYLAB kutmaydi: kutish savdoni keyingi bosqichlarga ham o'tkazib
     * yuborardi va testning o'z qadamlari ("to'lov tasdiqlandi") o'z
     * navbatida yaroqsiz bo'lib qolardi. Bu yerda faqat poygada yutqazish
     * jim qabul qilinadi.
     */
    protected void leaveInitiated(TradeService trades, UUID tradeId) {
        try {
            trades.transition(tradeId, TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
        } catch (InvalidTradeTransitionException raced) {
            // Worker ulgurdi — savdo allaqachon INITIATED dan chiqqan.
        }
    }

    @DynamicPropertySource
    static void registerKafkaAndRedis(DynamicPropertyRegistry r) {
        r.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        r.add("spring.data.redis.password", () -> "");
    }
}
