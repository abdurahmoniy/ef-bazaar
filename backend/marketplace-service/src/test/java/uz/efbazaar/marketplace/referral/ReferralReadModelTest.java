package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Taklif sahifasi va adminka o'qishlari.
 *
 * <p>Ismlar auth-service'da, sanoqlar bu yerda. Ularni birlashtirish
 * har qator uchun alohida so'rovga aylanib ketmasligi kerak — bu
 * "N+1" ning eng oson tug'iladigan joyi.
 */
class ReferralReadModelTest {

    private ReferralRepository referrals;
    private ReferralCodeService codes;
    private AuthSummaryClient users;
    private ReferralService service;

    private final UUID me = UUID.randomUUID();
    private final UUID invitedA = UUID.randomUUID();
    private final UUID invitedB = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        referrals = mock(ReferralRepository.class);
        codes = mock(ReferralCodeService.class);
        users = mock(AuthSummaryClient.class);
        ReferralSettingsRepository settingsRepo = mock(ReferralSettingsRepository.class);

        ReferralSettings s = new ReferralSettings();
        s.setRewardSom(new BigDecimal("5000.00"));
        when(settingsRepo.findById(ReferralSettings.SINGLETON_ID)).thenReturn(Optional.of(s));
        when(codes.codeFor(me)).thenReturn("ABCD2345");

        service = new ReferralService(referrals, codes, settingsRepo, users,
                mock(ReferralRewardClient.class));
    }

    private void whenInvited(Referral... rows) {
        when(referrals.findByReferrerUserIdOrderByCreatedAtDesc(me)).thenReturn(List.of(rows));
    }

    private void whenNamesKnown() {
        when(users.resolveAll(any())).thenReturn(Map.of(
                invitedA, new UserSummary(invitedA, "Aziz", null, null, false, Instant.now(), false),
                invitedB, new UserSummary(invitedB, "Bekzod", null, null, false, Instant.now(), false)));
    }

    private Referral paid(UUID who) {
        Referral r = new Referral(who, me, null);
        r.setRewardedAt(Instant.now());
        r.setRewardSom(new BigDecimal("5000.00"));
        return r;
    }

    @Test
    @DisplayName("my page shows the code, the counts and what it earned")
    void myReferrals() {
        whenInvited(paid(invitedA), new Referral(invitedB, me, null));
        whenNamesKnown();

        var response = service.myReferrals(me);

        assertThat(response.code()).isEqualTo("ABCD2345");
        assertThat(response.invitedCount()).isEqualTo(2);
        assertThat(response.rewardedCount()).isEqualTo(1);
        assertThat(response.earnedSom()).isEqualByComparingTo("5000.00");
        assertThat(response.rewardSom()).isEqualByComparingTo("5000.00");
        assertThat(response.invited()).extracting(ReferralDtos.InvitedUser::displayName)
                .containsExactlyInAnyOrder("Aziz", "Bekzod");
    }

    @Test
    @DisplayName("names are fetched in one call, not one per row")
    void namesAreBatched() {
        whenInvited(paid(invitedA), new Referral(invitedB, me, null));
        whenNamesKnown();

        service.myReferrals(me);

        verify(users).resolveAll(any());
        verify(users, never()).resolve(any());
    }

    @Test
    @DisplayName("a referrer with nobody yet gets their code and zeroes, not an error")
    void emptyPage() {
        whenInvited();

        var response = service.myReferrals(me);

        assertThat(response.code()).isEqualTo("ABCD2345");
        assertThat(response.invitedCount()).isZero();
        assertThat(response.earnedSom()).isEqualByComparingTo("0");
        assertThat(response.invited()).isEmpty();
        // Hech kim yo'q bo'lsa auth'ga umuman bormaymiz.
        verify(users, never()).resolveAll(any());
    }

    @Test
    @DisplayName("a name auth cannot resolve leaves the row, without a name")
    void missingNameDoesNotDropTheRow() {
        whenInvited(new Referral(invitedA, me, null));
        when(users.resolveAll(any())).thenReturn(Map.of());

        var response = service.myReferrals(me);

        // Ism yo'qligi qatorni yo'qotish uchun sabab emas: sanoq
        // ismga emas, qatorga bog'liq.
        assertThat(response.invited()).hasSize(1);
        assertThat(response.invited().get(0).displayName()).isNull();
    }

    @Test
    @DisplayName("changing the reward stamps who changed it and when")
    void updateSettingsRecordsTheAdmin() {
        UUID admin = UUID.randomUUID();
        ReferralSettingsRepository repo = mock(ReferralSettingsRepository.class);
        ReferralSettings existing = new ReferralSettings();
        existing.setRewardSom(new BigDecimal("5000.00"));
        when(repo.findById(ReferralSettings.SINGLETON_ID)).thenReturn(Optional.of(existing));
        when(repo.save(any())).thenAnswer(i -> i.getArgument(0));

        var svc = new ReferralService(referrals, codes, repo, users, mock(ReferralRewardClient.class));
        var saved = svc.updateSettings(new BigDecimal("7000.00"), admin);

        assertThat(saved.getRewardSom()).isEqualByComparingTo("7000.00");
        assertThat(saved.getUpdatedBy()).isEqualTo(admin);
    }
}
