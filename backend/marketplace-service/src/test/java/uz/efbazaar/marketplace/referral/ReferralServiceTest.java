package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Da'vo qoidalari.
 *
 * <p>Bu yerdagi xato ikki yo'ldan biri bilan zarar keltiradi: birovning
 * referalini o'g'irlaydi, yoki eski foydalanuvchini yangi deb hisoblab,
 * hech kim olib kelmagan odam uchun mukofot to'laydi. Ikkalasi ham
 * ekranda xato ko'rsatmaydi.
 */
class ReferralServiceTest {

    private ReferralRepository referrals;
    private ReferralCodeService codes;
    private AuthSummaryClient users;
    private ReferralService service;

    private final UUID newcomer = UUID.randomUUID();
    private final UUID referrer = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        referrals = mock(ReferralRepository.class);
        codes = mock(ReferralCodeService.class);
        users = mock(AuthSummaryClient.class);
        service = new ReferralService(referrals, codes,
                mock(ReferralSettingsRepository.class), users, mock(ReferralRewardClient.class));

        when(codes.resolve("GOODCODE")).thenReturn(Optional.of(referrer));
        when(referrals.findById(newcomer)).thenReturn(Optional.empty());
        whenAccountAge(Duration.ofMinutes(2));
    }

    private void whenAccountAge(Duration age) {
        when(users.resolve(newcomer)).thenReturn(Optional.of(new UserSummary(
                newcomer, "Yangi", null, null, false, Instant.now().minus(age), false)));
    }

    @Test
    @DisplayName("a fresh account claims the code it arrived with")
    void claims() {
        assertThat(service.claim(newcomer, "GOODCODE")).isTrue();
        verify(referrals).save(any(Referral.class));
    }

    @Test
    @DisplayName("an account older than the window claims nothing")
    void tooOld() {
        whenAccountAge(Duration.ofDays(400));
        assertThat(service.claim(newcomer, "GOODCODE")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("an account right at the edge of the window still claims")
    void justInsideTheWindow() {
        whenAccountAge(Duration.ofMinutes(59));
        assertThat(service.claim(newcomer, "GOODCODE")).isTrue();
    }

    @Test
    @DisplayName("an already-referred user cannot be claimed again")
    void alreadyReferred() {
        when(referrals.findById(newcomer))
                .thenReturn(Optional.of(new Referral(newcomer, UUID.randomUUID(), null)));
        assertThat(service.claim(newcomer, "GOODCODE")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("a user cannot refer themselves")
    void selfReferral() {
        when(codes.resolve("MYOWNCODE")).thenReturn(Optional.of(newcomer));
        assertThat(service.claim(newcomer, "MYOWNCODE")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("an unknown code claims nothing and does not throw")
    void unknownCode() {
        when(codes.resolve("NOSUCH")).thenReturn(Optional.empty());
        assertThat(service.claim(newcomer, "NOSUCH")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("a user auth has never heard of claims nothing")
    void unknownUser() {
        when(users.resolve(newcomer)).thenReturn(Optional.empty());
        assertThat(service.claim(newcomer, "GOODCODE")).isFalse();
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("auth being unreachable is not treated as a fresh account")
    void authFailureDoesNotClaim() {
        // Xato yutilib "yangi akkount" deb hisoblansa, auth o'chgan paytda
        // har qanday eski foydalanuvchi referalga aylanib qolardi.
        when(users.resolve(newcomer)).thenThrow(new RuntimeException("auth down"));
        assertThat(service.claim(newcomer, "GOODCODE")).isFalse();
        verify(referrals, never()).save(any());
    }
}
