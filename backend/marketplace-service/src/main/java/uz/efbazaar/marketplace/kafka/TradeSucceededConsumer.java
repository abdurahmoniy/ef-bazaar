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
    private final uz.efbazaar.marketplace.account.ListingAccountLink accounts;

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
        // Akkount sotuvchidan xaridorga ko'chadi. Mukofotdan KEYIN: ikkalasi
        // mustaqil va biri yiqilsa ikkinchisi baribir bajarilishi kerak.
        accounts.onTradeSucceeded(e.tradeId(), e.listingId(), e.buyerId(), e.sellerId());
        // Akkount ochilib COMMIT bo'lgach: pochta topshirilgani haqidagi
        // hodisa boshqa topikda va boshqa tranzaksiyada keladi. Bir vaqtda
        // ishlansa u akkountni ko'rmay manzilni kutishga qo'yib ketadi va
        // uni endi hech kim olmaydi — shuning uchun bu yerda yana qaraladi.
        // Ikkala taraf uchun ham: obmenda sotuvchi ham akkount oladi.
        accounts.drainPendingEmail(e.tradeId(), e.buyerId());
        accounts.drainPendingEmail(e.tradeId(), e.sellerId());
    }
}
