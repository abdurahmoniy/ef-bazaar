package uz.efbazaar.marketplace;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.data.jpa.JpaRepositoriesAutoConfiguration;
import org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration;
import org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.ActiveProfiles;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.LikeRepository;
import uz.efbazaar.marketplace.repository.ListingReportRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.repository.NotificationRepository;

@SpringBootTest(properties = {
        // EfbazaarDataSourceConfig'da @ConfigurationProperties bind bo'lishi uchun fake URL'lar.
        // DataSource bean'lari yaratiladi, lekin haqiqiy ulanish qilinmaydi (lazy).
        "spring.datasource.url=jdbc:postgresql://localhost/test",
        "spring.datasource.username=test",
        "spring.datasource.password=test",
        "app.cards.datasource.url=jdbc:postgresql://localhost/test",
        "app.cards.datasource.username=test",
        "app.cards.datasource.password=test"
})
@EnableAutoConfiguration(exclude = {
        DataSourceAutoConfiguration.class,
        HibernateJpaAutoConfiguration.class,
        JpaRepositoriesAutoConfiguration.class,
        FlywayAutoConfiguration.class,
        RedisAutoConfiguration.class,
        RedisRepositoriesAutoConfiguration.class,
        KafkaAutoConfiguration.class
})
@ActiveProfiles("test")
class MarketplaceApplicationTests {

    @MockBean ListingRepository listingRepository;
    @MockBean LikeRepository likeRepository;
    @MockBean ChatRepository chatRepository;
    @MockBean ChatMessageRepository chatMessageRepository;
    @MockBean ChatParticipantRepository chatParticipantRepository;
    @MockBean AttributeDefinitionRepository attributeDefinitionRepository;
    @MockBean ListingReportRepository listingReportRepository;
    @MockBean NotificationRepository notificationRepository;
    @MockBean KafkaTemplate<String, Object> kafkaTemplate;
    // gamer paketi (Gamer Card projection)
    @MockBean uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsRepository gamerStatsRepository;
    @MockBean uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsMatchRepository gamerStatsMatchRepository;
    @MockBean uz.efbazaar.marketplace.gamer.GamerRepositories.GamerProfileRepository gamerProfileRepository;
    // trust paketi (shikoyat + blacklist)
    @MockBean uz.efbazaar.marketplace.trust.TrustRepositories.ComplaintRepository complaintRepository;
    @MockBean uz.efbazaar.marketplace.trust.TrustRepositories.PenaltyRepository penaltyRepository;
    @MockBean uz.efbazaar.marketplace.trust.TrustRepositories.BlacklistIdentifierRepository blacklistIdentifierRepository;

    @Test
    void contextLoads() {
    }
}
