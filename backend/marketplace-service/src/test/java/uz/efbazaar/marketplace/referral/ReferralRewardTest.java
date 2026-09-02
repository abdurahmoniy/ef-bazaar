package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.PendingReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Mukofot qarori.
 *
 * <p>"Faqat birinchi savdo" qoidasi shu yerda sinaladi. U buzilsa har
 * savdodan to'lanadi, va buni hech kim darhol sezmaydi — hisobot
 * chiqarilgunicha yoki hamyonlar tekshirilgunicha.
 */
class ReferralRewardTest {

    private ReferralRepository referrals;
    private ReferralRewardClient rewards;
    private ReferralService service;

    private final UUID trade = UUID.randomUUID();
    private final UUID buyer = UUID.randomUUID();
    private final UUID seller = UUID.randomUUID();
    private final UUID buyersReferrer = UUID.randomUUID();
    private final UUID sellersReferrer = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        referrals = mock(ReferralRepository.class);
        rewards = mock(ReferralRewardClient.class);
        ReferralSettingsRepository settings = mock(ReferralSettingsRepository.class);

        ReferralSettings s = new ReferralSettings();
        s.setRewardSom(new BigDecimal("5000.00"));
        when(settings.findById(ReferralSettings.SINGLETON_ID)).thenReturn(Optional.of(s));

        when(referrals.findById(any())).thenReturn(Optional.empty());
        when(referrals.save(any())).thenAnswer(i -> i.getArgument(0));

        service = new ReferralService(referrals, mock(ReferralCodeService.class),
                settings, mock(AuthSummaryClient.class), rewards, mock(PendingReferralRepository.class));
    }

    private Referral unrewarded(UUID referred, UUID referrer) {
        return new Referral(referred, referrer, null);
    }

    @Test
    @DisplayName("the referrer of a first-time buyer is paid")
    void paysBuyersReferrer() {
        when(referrals.findById(buyer)).thenReturn(Optional.of(unrewarded(buyer, buyersReferrer)));

        service.rewardFor(trade, buyer, seller);

        verify(rewards).reward(eq(buyer), eq(buyersReferrer), eq(new BigDecimal("5000.00")));
    }

    @Test
    @DisplayName("the side the referred user was on does not matter")
    void paysSellersReferrer() {
        when(referrals.findById(seller)).thenReturn(Optional.of(unrewarded(seller, sellersReferrer)));

        service.rewardFor(trade, buyer, seller);

        verify(rewards).reward(eq(seller), eq(sellersReferrer), any());
    }

    @Test
    @DisplayName("two first-timers with different referrers pay both")
    void paysBoth() {
        when(referrals.findById(buyer)).thenReturn(Optional.of(unrewarded(buyer, buyersReferrer)));
        when(referrals.findById(seller)).thenReturn(Optional.of(unrewarded(seller, sellersReferrer)));

        service.rewardFor(trade, buyer, seller);

        verify(rewards).reward(eq(buyer), eq(buyersReferrer), any());
        verify(rewards).reward(eq(seller), eq(sellersReferrer), any());
    }

    @Test
    @DisplayName("a second trade pays nothing")
    void onlyTheFirstTrade() {
        Referral already = unrewarded(buyer, buyersReferrer);
        already.setRewardedAt(Instant.now());
        already.setRewardSom(new BigDecimal("5000.00"));
        when(referrals.findById(buyer)).thenReturn(Optional.of(already));

        service.rewardFor(trade, buyer, seller);

        verify(rewards, never()).reward(any(), any(), any());
    }

    @Test
    @DisplayName("a user nobody referred pays nothing")
    void noReferral() {
        service.rewardFor(trade, buyer, seller);
        verify(rewards, never()).reward(any(), any(), any());
    }

    @Test
    @DisplayName("the amount paid is stamped on the row, not re-read later")
    void freezesTheAmount() {
        Referral row = unrewarded(buyer, buyersReferrer);
        when(referrals.findById(buyer)).thenReturn(Optional.of(row));

        service.rewardFor(trade, buyer, seller);

        assertThat(row.getRewardedAt()).isNotNull();
        assertThat(row.getRewardSom()).isEqualByComparingTo("5000.00");
    }

    @Test
    @DisplayName("a failed payout leaves the reward still claimable")
    void failedPayoutIsNotStamped() {
        Referral row = unrewarded(buyer, buyersReferrer);
        when(referrals.findById(buyer)).thenReturn(Optional.of(row));
        doThrow(new RuntimeException("payment down"))
                .when(rewards).reward(any(), any(), any());

        service.rewardFor(trade, buyer, seller);

        // Muhr qo'yilmasa hodisa qayta yetkazilganda yana urinamiz, va
        // payment tarafdagi kalit bir xil bo'lgani uchun ikki marta
        // to'lanmaydi.
        assertThat(row.getRewardedAt()).isNull();
        assertThat(row.getRewardSom()).isNull();
    }

    @Test
    @DisplayName("one party failing does not cost the other their reward")
    void oneFailureDoesNotBlockTheOther() {
        when(referrals.findById(buyer)).thenReturn(Optional.of(unrewarded(buyer, buyersReferrer)));
        when(referrals.findById(seller)).thenReturn(Optional.of(unrewarded(seller, sellersReferrer)));
        doThrow(new RuntimeException("payment down"))
                .when(rewards).reward(eq(buyer), any(), any());

        service.rewardFor(trade, buyer, seller);

        verify(rewards).reward(eq(seller), eq(sellersReferrer), any());
    }

    @Test
    @DisplayName("a trade somebody made with themselves pays once, not twice")
    void samePartyOnBothSides() {
        when(referrals.findById(buyer)).thenReturn(Optional.of(unrewarded(buyer, buyersReferrer)));

        service.rewardFor(trade, buyer, buyer);

        verify(rewards).reward(eq(buyer), eq(buyersReferrer), any());
    }
}
