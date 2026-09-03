package uz.efbazaar.payment.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Mukofot ledger yozuvi.
 *
 * <p>Yozuvlar yig'indisi nolga teng bo'lmasa kitob buziladi va buni
 * hisobot chiqargunimizcha hech kim sezmaydi.
 */
class ReferralRewardServiceTest {

    private LedgerService ledger;
    private ReferralRewardService service;

    private final UUID referred = UUID.randomUUID();
    private final UUID referrer = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        ledger = mock(LedgerService.class);
        service = new ReferralRewardService(ledger);
    }

    @Test
    @DisplayName("the postings sum to zero and credit the referrer")
    void balancedPostings() {
        service.reward(referred, referrer, 500_000L);

        @SuppressWarnings("unchecked")
        var postings = (org.mockito.ArgumentCaptor<List<Posting>>)
                (org.mockito.ArgumentCaptor<?>) forClass(List.class);
        verify(ledger).post(eq(TransactionKind.REFERRAL_REWARD), anyString(),
                any(), anyString(), postings.capture());

        assertThat(postings.getValue().stream().mapToLong(Posting::amountTiyin).sum()).isZero();
        assertThat(postings.getValue())
                .contains(new Posting(LedgerAccount.USER_AVAILABLE, referrer, -500_000L))
                .contains(new Posting(LedgerAccount.PLATFORM_REVENUE, null, 500_000L));
    }

    @Test
    @DisplayName("the idempotency key is the referred user, so a redelivery pays once")
    void keyedOnReferredUser() {
        service.reward(referred, referrer, 500_000L);
        verify(ledger).post(any(), eq("referral-reward:" + referred), any(), anyString(), any());
    }

    @Test
    @DisplayName("a zero reward posts nothing rather than a zero entry")
    void zeroRewardPostsNothing() {
        service.reward(referred, referrer, 0L);
        verify(ledger, never()).post(any(), anyString(), any(), anyString(), any());
    }

    @Test
    @DisplayName("a negative reward is refused")
    void negativeRefused() {
        assertThatThrownBy(() -> service.reward(referred, referrer, -1L))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
