package uz.efbazaar.marketplace;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration;
import org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.kafka.core.KafkaTemplate;
import uz.efbazaar.marketplace.repository.CartItemRepository;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.LikeRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

@SpringBootTest
@EnableAutoConfiguration(exclude = {
        DataSourceAutoConfiguration.class,
        HibernateJpaAutoConfiguration.class,
        FlywayAutoConfiguration.class,
        RedisAutoConfiguration.class,
        RedisRepositoriesAutoConfiguration.class,
        KafkaAutoConfiguration.class
})
class MarketplaceApplicationTests {

    @MockBean ListingRepository listingRepository;
    @MockBean LikeRepository likeRepository;
    @MockBean CartItemRepository cartItemRepository;
    @MockBean ChatRepository chatRepository;
    @MockBean ChatMessageRepository chatMessageRepository;
    @MockBean KafkaTemplate<String, Object> kafkaTemplate;

    @Test
    void contextLoads() {
    }
}
