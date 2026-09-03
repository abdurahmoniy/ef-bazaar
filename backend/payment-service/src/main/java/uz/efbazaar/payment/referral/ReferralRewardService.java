package uz.efbazaar.payment.referral;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

/**
 * Referal mukofotini taklif qiluvchining hamyoniga yozadi.
 *
 * <p>Bu savdo komissiyasidan kesib olinmaydi — platformaning foydalanuvchi
 * jalb qilish xarajati. Shuning uchun u savdoning o'z tranzaksiyasiga
 * qo'shilmaydi: u tranzaksiya o'sha savdoning komissiyasiga tenglashishi
 * kerak.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReferralRewardService {

    private final LedgerService ledger;

    /**
     * @param referredUserId idempotentlik kaliti — bir odam uchun bir marta.
     */
    @Transactional
    public void reward(UUID referredUserId, UUID referrerUserId, long rewardTiyin) {
        if (rewardTiyin < 0) {
            throw new IllegalArgumentException("Mukofot manfiy bo'lishi mumkin emas: " + rewardTiyin);
        }
        // Nol summani yozmaymiz: chk_entry_non_zero nol yozuvni rad etadi,
        // va "hech narsa to'lanmadi" ni yozib qo'yishning ma'nosi yo'q.
        if (rewardTiyin == 0) return;

        ledger.post(TransactionKind.REFERRAL_REWARD,
                "referral-reward:" + referredUserId, null,
                "referral reward for " + referredUserId,
                List.of(
                        new Posting(LedgerAccount.PLATFORM_REVENUE, null, rewardTiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, referrerUserId, -rewardTiyin)));

        log.info("Referal mukofoti to'landi: {} tiyin, {} -> {}",
                rewardTiyin, referredUserId, referrerUserId);
    }
}
