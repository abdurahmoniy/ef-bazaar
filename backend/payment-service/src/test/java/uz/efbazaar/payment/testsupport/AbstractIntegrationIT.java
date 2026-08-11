package uz.efbazaar.payment.testsupport;

import org.springframework.test.context.DynamicPropertyRegistry;
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

    @DynamicPropertySource
    static void registerKafkaAndRedis(DynamicPropertyRegistry r) {
        r.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
        r.add("spring.data.redis.host", REDIS::getHost);
        r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
        r.add("spring.data.redis.password", () -> "");
    }
}
