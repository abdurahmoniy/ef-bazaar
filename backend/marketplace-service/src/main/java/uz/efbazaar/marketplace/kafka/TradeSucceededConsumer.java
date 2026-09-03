package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.referral.ReferralService;

/**
 * Savdo muvaffaqiyatli yopilganda referal mukofotini ishga soladi.
 *
 * <p>Qayta yetkazilishi zararsiz: mukofot bir marta to'lanadi, chunki
 * muvaffaqiyatli to'lovdan keyin {@code referrals.rewarded_at} muhrlangan
 * bo'ladi, va muhr qo'yilishidan oldin uzilib qolgan holatda ham payment
 * tarafdagi idempotentlik kaliti ikkinchi to'lovni o'tkazmaydi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeSucceededConsumer {

    private final ReferralService referrals;

    @KafkaListener(
            topics = "efbazaar.trade.trade-succeeded",
            groupId = "marketplace-trade-succeeded",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeSucceededDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onTradeSucceeded(TradeSucceededDto e) {
        referrals.rewardFor(e.tradeId(), e.buyerId(), e.sellerId());
    }
}
