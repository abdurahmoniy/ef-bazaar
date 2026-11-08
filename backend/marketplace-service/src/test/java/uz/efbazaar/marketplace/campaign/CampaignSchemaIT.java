package uz.efbazaar.marketplace.campaign;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.CampaignClickRepository;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.CampaignRepository;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.CampaignRepository.FunnelProjection;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.UserAcquisitionRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Kampaniya jadvallari va voronka so'rovi haqiqiy Postgres ustida.
 *
 * <p>"Birinchi manba g'olib" qoidasi PRIMARY KEY da, voronka esa native
 * SQL — ikkalasini ham mock'li sinov umuman ishlatmaydi.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(CampaignSchemaIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class CampaignSchemaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired CampaignRepository campaigns;
    @Autowired CampaignClickRepository clicks;
    @Autowired UserAcquisitionRepository acquisitions;
    @Autowired JdbcTemplate jdbc;

    private Campaign campaign(String code) {
        return campaigns.saveAndFlush(new Campaign(code, "Guruh " + code, Campaign.Kind.TELEGRAM_GROUP, null));
    }

    private void listing(UUID seller, String status) {
        jdbc.update("""
                INSERT INTO listings (id, seller_id, description, price, status)
                VALUES (?, ?, 'd', 100000, ?)""", UUID.randomUUID(), seller, status);
    }

    @Test
    @DisplayName("a user keeps exactly one source: a second attribution is rejected by the database")
    void oneSourcePerUser() {
        Campaign first = campaign("FIRST234");
        Campaign second = campaign("SECND234");
        UUID user = UUID.randomUUID();
        jdbc.update("INSERT INTO user_acquisitions (user_id, campaign_id) VALUES (?, ?)", user, first.getId());

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO user_acquisitions (user_id, campaign_id) VALUES (?, ?)", user, second.getId()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("an unknown campaign kind is rejected")
    void unknownKindRejected() {
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO acquisition_campaigns (id, code, name, kind)
                VALUES (?, 'KIND2345', 'x', 'BILLBOARD')""", UUID.randomUUID()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("the funnel counts people, not listings, at every stage")
    void funnelCountsPeople() {
        Campaign c = campaign("FUNL2345");
        UUID seller = UUID.randomUUID();
        UUID lurker = UUID.randomUUID();
        UUID outsider = UUID.randomUUID();

        clicks.saveAndFlush(new CampaignClick(c.getId(), CampaignClick.Channel.WEB, null, null));
        clicks.saveAndFlush(new CampaignClick(c.getId(), CampaignClick.Channel.BOT, null, 42L));
        clicks.saveAndFlush(new CampaignClick(c.getId(), CampaignClick.Channel.WEB, seller, null));
        acquisitions.saveAndFlush(new UserAcquisition(seller, c.getId()));
        acquisitions.saveAndFlush(new UserAcquisition(lurker, c.getId()));

        // Bitta sotuvchining uchta e'loni — voronkada bitta odam.
        listing(seller, "ACTIVE");
        listing(seller, "SOLD");
        listing(seller, "SOLD");
        // Kampaniyadan kelmagan odamning e'loni hisobga kirmaydi.
        listing(outsider, "SOLD");

        FunnelProjection row = campaigns.funnel().stream()
                .filter(r -> r.getId().equals(c.getId())).findFirst().orElseThrow();

        assertThat(row.getCode()).isEqualTo("FUNL2345");
        assertThat(row.getKind()).isEqualTo("TELEGRAM_GROUP");
        assertThat(row.getCreatedAt()).isNotNull();
        assertThat(row.getArchivedAt()).isNull();
        assertThat(row.getClicks()).isEqualTo(3);
        assertThat(row.getRegistrations()).isEqualTo(2);
        assertThat(row.getListed()).isEqualTo(1);
        assertThat(row.getSold()).isEqualTo(1);
    }

    @Test
    @DisplayName("archived campaigns are listed after active ones")
    void archivedListedLast() {
        Campaign old = campaign("OLDC2345");
        old.setArchivedAt(Instant.now());
        campaigns.saveAndFlush(old);
        Campaign fresh = campaign("NEWC2345");

        List<UUID> order = campaigns.funnel().stream().map(FunnelProjection::getId).toList();

        assertThat(order.indexOf(fresh.getId())).isLessThan(order.indexOf(old.getId()));
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = Campaign.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(
            basePackageClasses = Campaign.class,
            considerNestedRepositories = true)
    static class Config {}
}
