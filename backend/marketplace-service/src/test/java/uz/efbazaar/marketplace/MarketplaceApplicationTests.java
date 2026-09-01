package uz.efbazaar.marketplace;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
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
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;
import uz.efbazaar.marketplace.repository.ChatAccountRequestRepository;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.LikeRepository;
import uz.efbazaar.marketplace.repository.ListingReportRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.repository.NotificationRepository;
import uz.efbazaar.marketplace.repository.DreamTeamRepository;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        // EfbazaarDataSourceConfig'da @ConfigurationProperties bind bo'lishi uchun fake URL'lar.
        // DataSource bean'lari yaratiladi, lekin haqiqiy ulanish qilinmaydi (lazy).
        "spring.datasource.url=jdbc:postgresql://localhost/test",
        "spring.datasource.username=test",
        "spring.datasource.password=test",
        "app.cards.datasource.url=jdbc:postgresql://localhost/test",
        "app.cards.datasource.username=test",
        "app.cards.datasource.password=test",
        "app.cards.schema-bootstrap.enabled=false",
        "app.card-interest.hmac-secret=test-card-interest-secret"
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

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired @Qualifier("efbazaarJdbcTemplate") JdbcTemplate efbazaarJdbcTemplate;
    @Autowired @Qualifier("dataSource") DataSource marketplaceDataSource;

    @MockBean ListingRepository listingRepository;
    @MockBean LikeRepository likeRepository;
    @MockBean ChatRepository chatRepository;
    @MockBean ChatMessageRepository chatMessageRepository;
    @MockBean ChatAccountRequestRepository chatAccountRequestRepository;
    @MockBean ChatParticipantRepository chatParticipantRepository;
    @MockBean AttributeDefinitionRepository attributeDefinitionRepository;
    @MockBean ListingReportRepository listingReportRepository;
    @MockBean NotificationRepository notificationRepository;
    @MockBean DreamTeamRepository dreamTeamRepository;
    @MockBean KafkaTemplate<String, Object> kafkaTemplate;
    @MockBean StringRedisTemplate stringRedisTemplate;
    // gamer paketi (Gamer Card projection)
    @MockBean uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsRepository gamerStatsRepository;
    @MockBean uz.efbazaar.marketplace.gamer.GamerRepositories.GamerStatsMatchRepository gamerStatsMatchRepository;
    @MockBean uz.efbazaar.marketplace.gamer.GamerRepositories.GamerProfileRepository gamerProfileRepository;
    // bot sozlamalari (/start xabari)
    @MockBean uz.efbazaar.marketplace.botsettings.BotSettingsRepository botSettingsRepository;
    @MockBean uz.efbazaar.marketplace.botsettings.BotBroadcastRepository botBroadcastRepository;
    // hamkorlik
    @MockBean uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository partnerSettingsRepository;
    @MockBean uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerApplicationRepository partnerApplicationRepository;
    @MockBean uz.efbazaar.marketplace.partner.PartnerRepositories.AdminSectionViewRepository adminSectionViewRepository;
    // trust paketi (shikoyat + blacklist)
    @MockBean uz.efbazaar.marketplace.trust.TrustRepositories.ComplaintRepository complaintRepository;
    @MockBean uz.efbazaar.marketplace.trust.TrustRepositories.PenaltyRepository penaltyRepository;
    @MockBean uz.efbazaar.marketplace.trust.TrustRepositories.BlacklistIdentifierRepository blacklistIdentifierRepository;

    @Test
    void contextLoads() {
    }

    @Test
    void defaultJdbcTemplateUsesMarketplaceDataSource() {
        assertThat(jdbcTemplate).isNotSameAs(efbazaarJdbcTemplate);
        assertThat(jdbcTemplate.getDataSource()).isSameAs(marketplaceDataSource);
    }
}
