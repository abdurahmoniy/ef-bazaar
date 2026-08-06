package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.dto.RateAdminRequest;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminRatingService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeAdminRatingIT extends AbstractIntegrationIT {

    @Autowired TradeAdminRatingService ratings;
    @Autowired TradeRepository trades;
    @Autowired TradeAdminProfileRepository profiles;

    private UUID adminId;
    private Trade trade;

    private void givenSuccessfulTrade(Instant updatedAt) {
        adminId = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(adminId).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        trade = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.SUCCESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .adminAcceptedAt(updatedAt.minus(Duration.ofHours(2)))
                .adminClosedAt(updatedAt.minus(Duration.ofHours(1)))
                .updatedAt(updatedAt)
                .expiresAt(updatedAt.plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void bothPartiesMayRateAndTheAverageFollows() {
        givenSuccessfulTrade(Instant.now());

        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(5, "zo'r ishladi"));
        ratings.rate(trade.getBuyerId(), trade.getId(), new RateAdminRequest(3, null));

        TradeAdminProfile p = profiles.findById(adminId).orElseThrow();
        assertThat(p.getRatingCount()).isEqualTo(2);
        assertThat(p.getRatingSum()).isEqualTo(8);
        assertThat(p.averageStars()).isEqualTo(4.0);
    }

    @Test
    void aPartyMayRateOnlyOnce() {
        givenSuccessfulTrade(Instant.now());
        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(5, null));

        assertThatThrownBy(() -> ratings.rate(trade.getSellerId(), trade.getId(),
                new RateAdminRequest(1, "fikrimni o'zgartirdim")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");

        assertThat(profiles.findById(adminId).orElseThrow().getRatingCount()).isEqualTo(1);
    }

    @Test
    void theAdminCannotRateThemselves() {
        givenSuccessfulTrade(Instant.now());

        assertThatThrownBy(() -> ratings.rate(adminId, trade.getId(),
                new RateAdminRequest(5, "o'zimni maqtayman")))
                .isInstanceOf(RuntimeException.class);

        assertThat(profiles.findById(adminId).orElseThrow().getRatingCount()).isEqualTo(0);
    }

    @Test
    void aStrangerCannotRate() {
        givenSuccessfulTrade(Instant.now());

        assertThatThrownBy(() -> ratings.rate(UUID.randomUUID(), trade.getId(),
                new RateAdminRequest(5, "men bu savdoda yo'q edim")))
                .isInstanceOf(RuntimeException.class);

        assertThat(profiles.findById(adminId).orElseThrow().getRatingCount()).isEqualTo(0);
    }

    @Test
    void ratingBeforeSuccessIsRefused() {
        givenSuccessfulTrade(Instant.now());
        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setState(TradeState.IN_PROGRESS);
        trades.save(t);

        assertThatThrownBy(() -> ratings.rate(trade.getSellerId(), trade.getId(),
                new RateAdminRequest(5, null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void theWindowClosesAfterSevenDays() {
        givenSuccessfulTrade(Instant.now().minus(Duration.ofDays(8)));

        assertThatThrownBy(() -> ratings.rate(trade.getSellerId(), trade.getId(),
                new RateAdminRequest(5, null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void theWindowStillAcceptsWellWithinSevenDays() {
        givenSuccessfulTrade(Instant.now().minus(Duration.ofDays(6)));

        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(5, null));

        assertThat(profiles.findById(adminId).orElseThrow().getRatingCount()).isEqualTo(1);
    }

    @Test
    void theWindowStillAcceptsAtExactlySevenDays() {
        // updatedAt + 7 days lands a few seconds in the future of "now" — inside the window.
        givenSuccessfulTrade(Instant.now().minus(Duration.ofDays(7)).plus(Duration.ofSeconds(30)));

        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(5, null));

        assertThat(profiles.findById(adminId).orElseThrow().getRatingCount()).isEqualTo(1);
    }

    @Test
    void smartTradeHasNobodyToRate() {
        Trade smart = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.SUCCESS)
                .mailboxId(UUID.randomUUID())
                .sellerCardId(UUID.randomUUID())
                .buyerCardId(UUID.randomUUID())
                .mode(TradeMode.SMART)
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build());

        assertThatThrownBy(() -> ratings.rate(smart.getSellerId(), smart.getId(),
                new RateAdminRequest(5, null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void hidingBlanksTheCommentButKeepsTheStar() {
        givenSuccessfulTrade(Instant.now());
        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(1, "haqoratli matn"));
        UUID ratingId = ratings.listPublic(adminId).get(0).id();
        UUID platformAdmin = UUID.randomUUID();

        ratings.hide(ratingId, platformAdmin);

        var visible = ratings.listPublic(adminId);
        assertThat(visible).hasSize(1);
        assertThat(visible.get(0).comment()).isNull();
        assertThat(visible.get(0).stars()).isEqualTo((short) 1);

        TradeAdminProfile p = profiles.findById(adminId).orElseThrow();
        assertThat(p.getRatingCount())
                .as("moderation must not be a way to raise a score")
                .isEqualTo(1);
        assertThat(p.getRatingSum()).isEqualTo(1);
    }

    @Test
    void publicListIsNewestFirst() {
        givenSuccessfulTrade(Instant.now());
        ratings.rate(trade.getSellerId(), trade.getId(), new RateAdminRequest(5, "birinchi"));
        ratings.rate(trade.getBuyerId(), trade.getId(), new RateAdminRequest(4, "ikkinchi"));

        var list = ratings.listPublic(adminId);

        assertThat(list).hasSize(2);
        assertThat(list.get(0).createdAt()).isAfterOrEqualTo(list.get(1).createdAt());
    }
}
