package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.kafka.UserRoleChangedConsumer;
import uz.efbazaar.trade.kafka.UserRoleChangedDto;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class UserRoleChangedConsumerIT extends AbstractIntegrationIT {

    @Autowired TradeAdminProfileRepository profiles;
    @Autowired UserRoleChangedConsumer consumer;

    private UUID profileFor(boolean active) {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id)
                .minFeeUzs(15_000)
                .maxFeeUzs(40_000)
                .active(active)
                .build());
        return id;
    }

    @Test
    void losingTheRoleDeactivatesTheProfile() {
        UUID admin = profileFor(true);

        consumer.onRoleChanged(new UserRoleChangedDto(
                admin, "TRADE_ADMIN", "USER", Instant.now()));

        assertThat(profiles.findById(admin).orElseThrow().isActive()).isFalse();
    }

    @Test
    void regainingTheRoleReactivatesTheProfile() {
        UUID admin = profileFor(false);

        consumer.onRoleChanged(new UserRoleChangedDto(
                admin, "USER", "TRADE_ADMIN", Instant.now()));

        assertThat(profiles.findById(admin).orElseThrow().isActive()).isTrue();
    }

    @Test
    void ratingHistorySurvivesDeactivation() {
        UUID admin = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(admin)
                .minFeeUzs(15_000)
                .maxFeeUzs(40_000)
                .ratingSum(24)
                .ratingCount(6)
                .completedCount(6)
                .build());

        consumer.onRoleChanged(new UserRoleChangedDto(
                admin, "TRADE_ADMIN", "USER", Instant.now()));

        TradeAdminProfile after = profiles.findById(admin).orElseThrow();
        assertThat(after.isActive()).isFalse();
        assertThat(after.getRatingCount()).isEqualTo(6);
        assertThat(after.averageStars()).isEqualTo(4.0);
    }

    @Test
    void unrelatedRoleChangeIsIgnored() {
        UUID admin = profileFor(true);

        // USER → ADMIN: nothing to do with trade admins.
        consumer.onRoleChanged(new UserRoleChangedDto(
                admin, "USER", "ADMIN", Instant.now()));

        assertThat(profiles.findById(admin).orElseThrow().isActive()).isFalse();
    }

    @Test
    void eventForSomebodyWithNoProfileIsHarmless() {
        consumer.onRoleChanged(new UserRoleChangedDto(
                UUID.randomUUID(), "TRADE_ADMIN", "USER", Instant.now()));
        // No exception is the assertion.
    }
}
