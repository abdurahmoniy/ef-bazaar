package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.service.TradeService;

/**
 * Pochta qutisi ochilmadi — savdoni muvaffaqiyatsiz yakunlaydi.
 *
 * <p>INITIATED yagona chiqishsiz holat edi: deadline yo'q, TIMEOUT
 * yo'q, rad etish ham yo'q. Worker uch urinishdan keyin offsetni
 * commit qilib o'tib ketardi va savdo xaridorning puli muzlatilgan
 * holda abadiy qotib qolardi — uni faqat qo'lda, bazaga kirib
 * ochish mumkin edi.
 *
 * <p>Endi savdo yopiladi, pul qaytariladi va ochilmagan qutilar
 * yo'q qilinadi: hech qanday iz qolmaydi va foydalanuvchi qaytadan
 * ocha oladi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmailProvisionFailedConsumer {

    private final TradeService trades;

    @KafkaListener(
            topics = TradeEvents.TOPIC_EMAIL_PROVISION_FAILED,
            groupId = "trade-service-email-provision-failed",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$EmailProvisionFailed"}
    )
    public void onProvisionFailed(TradeEvents.EmailProvisionFailed e) {
        if (e == null || e.tradeId() == null) {
            log.warn("email-provision-failed without a trade id — dropping");
            return;
        }
        log.error("Trade {} pochta qutisi ochilmadi ({}) — savdo yopiladi",
                e.tradeId(), e.reason());
        try {
            trades.transition(e.tradeId(), TradeEvent.PROVISION_FAILED, ActorType.SYSTEM, null);
        } catch (RuntimeException ex) {
            // Savdo allaqachon boshqa holatga o'tgan bo'lishi mumkin:
            // ikki qutili savdoda biri ochilib, ikkinchisi yiqilsa
            // birinchisi allaqachon oldinga surgan bo'ladi. Bu xato
            // emas va offsetni to'sib qo'yishga arzimaydi.
            log.warn("Trade {} ni yopib bo'lmadi: {}", e.tradeId(), ex.toString());
        }
    }
}
