package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.PendingReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralSettingsRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Bot yo'li: kod odam ro'yxatdan o'tishidan oldin keladi.
 *
 * <p>Bu yerda akkount yoshi TEKSHIRILMAYDI va tekshirilmasligi kerak.
 * Veb yo'li {@code createdAt} ga qaraydi, chunki uning boshqa signali
 * yo'q; bu yo'lda esa hodisaning o'zi signal — u bir marta, ta'rifi
 * bo'yicha yangi akkount uchun otadi.
 */
class PendingReferralTest {

    private PendingReferralRepository pending;
    private ReferralRepository referrals;
    private ReferralCodeService codes;
    private ReferralService service;

    private final long telegramId = 4242L;
    private final UUID newcomer = UUID.randomUUID();
    private final UUID referrer = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        pending = mock(PendingReferralRepository.class);
        referrals = mock(ReferralRepository.class);
        codes = mock(ReferralCodeService.class);
        service = new ReferralService(referrals, codes, mock(ReferralSettingsRepository.class),
                mock(AuthSummaryClient.class), mock(ReferralRewardClient.class), pending);

        when(codes.resolve("ABCD2345")).thenReturn(
                Optional.of(new ReferralCodeService.ResolvedCode(referrer, null)));
        when(referrals.findById(any())).thenReturn(Optional.empty());
        when(pending.findById(telegramId))
                .thenReturn(Optional.of(new PendingReferral(telegramId, "ABCD2345")));
    }

    @Test
    @DisplayName("the bot's code is stored against the telegram id")
    void remembers() {
        service.remember(telegramId, "ABCD2345");

        var saved = forClass(PendingReferral.class);
        verify(pending).save(saved.capture());
        assertThat(saved.getValue().getTelegramId()).isEqualTo(telegramId);
        assertThat(saved.getValue().getCode()).isEqualTo("ABCD2345");
    }

    @Test
    @DisplayName("registration converts the pending row into a referral")
    void convertsOnRegistration() {
        service.claimOnRegistration(newcomer, telegramId);

        var saved = forClass(Referral.class);
        verify(referrals).save(saved.capture());
        assertThat(saved.getValue().getReferrerUserId()).isEqualTo(referrer);
        assertThat(saved.getValue().getReferredUserId()).isEqualTo(newcomer);
        verify(pending).deleteById(telegramId);
    }

    @Test
    @DisplayName("a registration with no pending code does nothing")
    void nothingPending() {
        when(pending.findById(telegramId)).thenReturn(Optional.empty());

        service.claimOnRegistration(newcomer, telegramId);

        verify(referrals, never()).save(any());
        // O'chirishga ham hojat yo'q — qator yo'q edi.
        verify(pending, never()).deleteById(any());
    }

    @Test
    @DisplayName("a registration with no telegram id does nothing")
    void noTelegramId() {
        service.claimOnRegistration(newcomer, null);
        verify(referrals, never()).save(any());
    }

    @Test
    @DisplayName("somebody who tapped their own link is not their own referral")
    void selfReferral() {
        when(codes.resolve("ABCD2345")).thenReturn(
                Optional.of(new ReferralCodeService.ResolvedCode(newcomer, null)));

        service.claimOnRegistration(newcomer, telegramId);

        verify(referrals, never()).save(any());
        // Qator baribir o'chiriladi: u endi hech qachon ishlamaydi, va
        // qolib ketsa jadval o'sib boraveradi.
        verify(pending).deleteById(telegramId);
    }

    @Test
    @DisplayName("a code that no longer resolves is dropped, not left behind")
    void staleCode() {
        when(codes.resolve("ABCD2345")).thenReturn(Optional.empty());

        service.claimOnRegistration(newcomer, telegramId);

        verify(referrals, never()).save(any());
        verify(pending).deleteById(telegramId);
    }

    @Test
    @DisplayName("an already-referred user is not re-referred by the bot path")
    void alreadyReferred() {
        when(referrals.findById(newcomer))
                .thenReturn(Optional.of(new Referral(newcomer, UUID.randomUUID(), null)));

        service.claimOnRegistration(newcomer, telegramId);

        verify(referrals, never()).save(any());
        verify(pending).deleteById(telegramId);
    }
}
