package uz.efbazaar.outbox.it;

import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.kafka.core.ProducerFactory;
import uz.efbazaar.outbox.internal.KafkaOutboxSender;

@SpringBootApplication
public class OutboxTestApplication {

    @Bean(destroyMethod = "destroy")
    KafkaOutboxSender realSender(ProducerFactory<?, ?> pf) {
        return new KafkaOutboxSender(pf);
    }

    @Bean
    @Primary
    ControllableSender controllableSender(KafkaOutboxSender real) {
        return new ControllableSender(real);
    }

    @Bean
    TestSnapshotSource testSnapshotSource() {
        return new TestSnapshotSource();
    }
}
