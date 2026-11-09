package uz.efbazaar.marketplace.channel;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.marketplace.channel.ChannelMemberRepositories.ChannelMemberEventRepository;
import uz.efbazaar.marketplace.channel.ChannelMemberRepositories.ChannelMemberEventRepository.DailyProjection;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Kunlik guruhlash Toshkent vaqtida va takroriy update'ni rad etish — haqiqiy Postgres'da. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@org.springframework.test.annotation.DirtiesContext(classMode = org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Testcontainers
@Import(ChannelMemberSchemaIT.Config.class)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.flyway.enabled=true",
        "app.cards.datasource.url=jdbc:postgresql://localhost/skip",
        "app.cards.datasource.username=skip",
        "app.cards.datasource.password=skip"
})
class ChannelMemberSchemaIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired ChannelMemberEventRepository events;

    @Test
    @DisplayName("days are Tashkent days: 20:30 UTC already belongs to the next day")
    void groupsByTashkentDay() {
        events.saveAndFlush(new ChannelMemberEvent(1L, "JOIN", Instant.parse("2026-11-01T10:00:00Z")));
        events.saveAndFlush(new ChannelMemberEvent(2L, "JOIN", Instant.parse("2026-11-01T20:30:00Z")));
        events.saveAndFlush(new ChannelMemberEvent(1L, "LEAVE", Instant.parse("2026-11-02T05:00:00Z")));

        List<DailyProjection> daily = events.daily(Instant.parse("2026-10-31T00:00:00Z"));

        assertThat(daily).hasSize(2);
        assertThat(daily.get(0).getDay()).isEqualTo(LocalDate.parse("2026-11-01"));
        assertThat(daily.get(0).getJoins()).isEqualTo(1);
        assertThat(daily.get(1).getDay()).isEqualTo(LocalDate.parse("2026-11-02"));
        assertThat(daily.get(1).getJoins()).isEqualTo(1);
        assertThat(daily.get(1).getLeaves()).isEqualTo(1);
    }

    @Test
    @DisplayName("the same Telegram update delivered twice is stored once")
    void redeliveryRejected() {
        Instant at = Instant.parse("2026-11-03T10:00:00Z");
        events.saveAndFlush(new ChannelMemberEvent(7L, "LEAVE", at));

        assertThatThrownBy(() -> events.saveAndFlush(new ChannelMemberEvent(7L, "LEAVE", at)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @org.springframework.boot.autoconfigure.domain.EntityScan(basePackageClasses = ChannelMemberEvent.class)
    @org.springframework.data.jpa.repository.config.EnableJpaRepositories(
            basePackageClasses = ChannelMemberEvent.class,
            considerNestedRepositories = true)
    static class Config {}
}
