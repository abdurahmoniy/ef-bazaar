package uz.efbazaar.bot;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.kafka.core.KafkaTemplate;

import static org.mockito.Mockito.mock;

@SpringBootTest
@EnableAutoConfiguration(exclude = {
        KafkaAutoConfiguration.class
})
class BotApplicationTests {

    /**
     * KafkaAutoConfiguration is excluded so the context boots without a real broker,
     * but {@code UserPhotoUploaderConsumer} (and any future producer) needs an
     * autowirable {@link KafkaTemplate}. Provide a mock — sends become no-ops in tests.
     */
    @TestConfiguration
    static class KafkaStubs {
        @Bean
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, Object> kafkaTemplate() {
            return mock(KafkaTemplate.class);
        }
    }

    @Test
    void contextLoads() {
    }
}
