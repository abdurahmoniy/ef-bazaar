package uz.efbazaar.trade.seller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.security.AuthSummaryClient;
import uz.efbazaar.trade.seller.domain.SellerRating;
import uz.efbazaar.trade.seller.dto.RateSellerRequest;
import uz.efbazaar.trade.seller.dto.SellerRatingResponse;
import uz.efbazaar.trade.seller.dto.SellerRatingSummaryResponse;
import uz.efbazaar.trade.seller.repository.SellerRatingRepository;
import uz.efbazaar.trade.seller.service.SellerRatingService;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SellerRatingServiceTest {

    private SellerRatingRepository repository;
    private TradeService tradeService;
    private TradeAuditService audit;
    private AuthSummaryClient authSummaries;
    private SellerRatingService service;

    private UUID buyerId;
    private UUID sellerId;
    private UUID tradeId;
    private Trade successfulTrade;

    @BeforeEach
    void setUp() {
        repository = mock(SellerRatingRepository.class);
        tradeService = mock(TradeService.class);
        audit = mock(TradeAuditService.class);
        authSummaries = mock(AuthSummaryClient.class);

        service = new SellerRatingService(repository, tradeService, audit, authSummaries);
        ReflectionTestUtils.setField(service, "windowDays", 14L);

        buyerId = UUID.randomUUID();
        sellerId = UUID.randomUUID();
        tradeId = UUID.randomUUID();

        successfulTrade = Trade.builder()
                .id(tradeId)
                .buyerId(buyerId)
                .sellerId(sellerId)
                .state(TradeState.SUCCESS)
                .updatedAt(Instant.now().minus(Duration.ofHours(2)))
                .build();

        when(tradeService.get(tradeId, buyerId)).thenReturn(successfulTrade);
        when(repository.save(any(SellerRating.class))).thenAnswer(inv -> {
            SellerRating r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            if (r.getCreatedAt() == null) r.setCreatedAt(Instant.now());
            return r;
        });
    }

    @Test
    void buyerCanRateSuccessfulTrade() {
        RateSellerRequest req = new RateSellerRequest(5, "Ajoyib sotuvchi!");
        when(repository.findByTradeId(tradeId)).thenReturn(Optional.empty());
        when(authSummaries.resolve(buyerId)).thenReturn(Optional.of(
                new AuthSummaryClient.UserSummary(buyerId, "Ali", "ali_ef", 123L, true, Instant.now(), false, null)
        ));

        SellerRatingResponse resp = service.rate(buyerId, tradeId, req);

        assertThat(resp).isNotNull();
        assertThat(resp.stars()).isEqualTo((short) 5);
        assertThat(resp.comment()).isEqualTo("Ajoyib sotuvchi!");
        assertThat(resp.raterDisplayName()).isEqualTo("Ali");
        assertThat(resp.sellerId()).isEqualTo(sellerId);
        verify(audit).record(eq(tradeId), any(), eq(buyerId), eq("SELLER_RATED"), any());
    }

    @Test
    void nonBuyerCannotRate() {
        UUID strangerId = UUID.randomUUID();
        Trade trade = Trade.builder()
                .id(tradeId)
                .buyerId(buyerId)
                .sellerId(sellerId)
                .state(TradeState.SUCCESS)
                .updatedAt(Instant.now())
                .build();
        when(tradeService.get(tradeId, strangerId)).thenReturn(trade);

        assertThatThrownBy(() -> service.rate(strangerId, tradeId, new RateSellerRequest(5, "zo'r")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Faqat xaridor");
    }

    @Test
    void cannotRateNonSuccessfulTrade() {
        Trade activeTrade = Trade.builder()
                .id(tradeId)
                .buyerId(buyerId)
                .sellerId(sellerId)
                .state(TradeState.IN_PROGRESS)
                .updatedAt(Instant.now())
                .build();
        when(tradeService.get(tradeId, buyerId)).thenReturn(activeTrade);

        assertThatThrownBy(() -> service.rate(buyerId, tradeId, new RateSellerRequest(5, "zo'r")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Baholash savdo muvaffaqiyatli yakunlangach");
    }

    @Test
    void cannotRateTwiceForSameTrade() {
        when(repository.findByTradeId(tradeId)).thenReturn(Optional.of(
                SellerRating.builder().id(UUID.randomUUID()).tradeId(tradeId).sellerId(sellerId).raterId(buyerId).stars((short) 5).build()
        ));

        assertThatThrownBy(() -> service.rate(buyerId, tradeId, new RateSellerRequest(4, "takror")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("allaqachon");
    }

    @Test
    void cannotRateAfterWindowExpired() {
        Trade expiredTrade = Trade.builder()
                .id(tradeId)
                .buyerId(buyerId)
                .sellerId(sellerId)
                .state(TradeState.SUCCESS)
                .updatedAt(Instant.now().minus(Duration.ofDays(15)))
                .build();
        when(tradeService.get(tradeId, buyerId)).thenReturn(expiredTrade);
        when(repository.findByTradeId(tradeId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.rate(buyerId, tradeId, new RateSellerRequest(5, "kech")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("muddati tugagan");
    }

    @Test
    void summaryCalculationComputesAverageAndDistribution() {
        List<SellerRating> ratings = List.of(
                SellerRating.builder().id(UUID.randomUUID()).sellerId(sellerId).stars((short) 5).build(),
                SellerRating.builder().id(UUID.randomUUID()).sellerId(sellerId).stars((short) 5).build(),
                SellerRating.builder().id(UUID.randomUUID()).sellerId(sellerId).stars((short) 4).build()
        );
        when(repository.findBySellerIdOrderByCreatedAtDesc(sellerId)).thenReturn(ratings);

        SellerRatingSummaryResponse summary = service.getSummary(sellerId);

        assertThat(summary.ratingCount()).isEqualTo(3);
        assertThat(summary.ratingSum()).isEqualTo(14);
        assertThat(summary.averageRating()).isEqualTo(4.7);
        assertThat(summary.starCounts().get(5)).isEqualTo(2L);
        assertThat(summary.starCounts().get(4)).isEqualTo(1L);
        assertThat(summary.starCounts().get(1)).isEqualTo(0L);
    }

    @Test
    void batchSummaryReturnsAllRequestedSellers() {
        UUID seller2 = UUID.randomUUID();
        List<SellerRating> ratings = List.of(
                SellerRating.builder().id(UUID.randomUUID()).sellerId(sellerId).stars((short) 5).build()
        );
        when(repository.findBySellerIdIn(List.of(sellerId, seller2))).thenReturn(ratings);

        Map<UUID, SellerRatingSummaryResponse> batch = service.getSummariesBatch(List.of(sellerId, seller2));

        assertThat(batch).containsKeys(sellerId, seller2);
        assertThat(batch.get(sellerId).ratingCount()).isEqualTo(1);
        assertThat(batch.get(sellerId).averageRating()).isEqualTo(5.0);
        assertThat(batch.get(seller2).ratingCount()).isEqualTo(0);
        assertThat(batch.get(seller2).averageRating()).isEqualTo(0.0);
    }

    @Test
    void adminCanHideComment() {
        UUID ratingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        SellerRating rating = SellerRating.builder()
                .id(ratingId)
                .tradeId(tradeId)
                .sellerId(sellerId)
                .raterId(buyerId)
                .stars((short) 1)
                .comment("Haqoratli matn")
                .build();
        when(repository.findById(ratingId)).thenReturn(Optional.of(rating));

        service.hide(ratingId, sellerId, adminId);

        assertThat(rating.isHidden()).isTrue();
        assertThat(rating.getHiddenBy()).isEqualTo(adminId);
        verify(repository).save(rating);
    }
}
