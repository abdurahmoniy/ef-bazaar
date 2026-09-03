package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.referral.ReferralService;

/**
 * Botdan kelgan taklif kodini ro'yxatdan o'tish paytida referalga
 * aylantiradi.
 *
 * <p>Guruh identifikatori botnikidan boshqa: ikkala servis ham shu
 * mavzuni mustaqil o'qiydi va biri ikkinchisining o'qishini yeb
 * qo'ymasligi kerak.
 *
 * <p>Bu hodisa akkount yoshining o'zi: u bir marta, faqat yangi
 * foydalanuvchi uchun otadi. Shuning uchun bu yo'lda veb yo'lidagi
 * {@code createdAt} tekshiruvi kerak emas.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserRegisteredConsumer {

    private final ReferralService referrals;

    @KafkaListener(
            topics = "efbazaar.auth.user-registered",
            groupId = "marketplace-referral-registration",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.UserRegisteredDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onUserRegistered(UserRegisteredDto e) {
        referrals.claimOnRegistration(e.userId(), e.telegramId());
    }
}
