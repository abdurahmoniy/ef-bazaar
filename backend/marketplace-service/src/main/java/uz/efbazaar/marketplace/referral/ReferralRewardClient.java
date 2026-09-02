package uz.efbazaar.marketplace.referral;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * marketplace → payment: referal mukofoti.
 *
 * <p>Hozircha bo'sh: mukofotni ishga soladigan yo'l (savdo yopilishi
 * hodisasi) keyingi qadamda quriladi. Imzo esa hozirdan qat'iy, chunki
 * {@link ReferralService} unga bog'lanadi.
 */
@Component
public class ReferralRewardClient {

    public void reward(UUID referredUserId, UUID referrerUserId, BigDecimal rewardSom) {
        throw new UnsupportedOperationException("Mukofot yo'li hali qurilmagan");
    }
}
