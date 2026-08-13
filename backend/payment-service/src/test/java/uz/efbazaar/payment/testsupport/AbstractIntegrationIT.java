package uz.efbazaar.payment.testsupport;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Full-stack test base: Postgres (from parent) + Kafka.
 * Use this whenever a test touches Kafka topics or scheduled jobs.
 */
public abstract class AbstractIntegrationIT extends AbstractPostgresIT {

    protected static final KafkaContainer KAFKA =
            new KafkaContainer(DockerImageName.parse("apache/kafka:3.7.0"))
                    .withReuse(true);

    static {
        KAFKA.start();
    }

    @DynamicPropertySource
    static void registerKafka(DynamicPropertyRegistry r) {
        r.add("spring.kafka.bootstrap-servers", KAFKA::getBootstrapServers);
    }
}
