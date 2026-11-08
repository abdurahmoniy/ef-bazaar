package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.campaign.CampaignService;

/**
 * Botdan kelgan kampaniya kodini ro'yxatdan o'tish paytida biriktirishga
 * aylantiradi.
 *
 * <p>Referal consumeridan ALOHIDA guruh: biri yiqilsa ikkinchisi o'z ishini
 * davom ettiradi va ular bir-birining offsetini yeb qo'ymaydi.
 */
@Component
@RequiredArgsConstructor
public class CampaignRegistrationConsumer {

    private final CampaignService campaigns;

    @KafkaListener(
            topics = "efbazaar.auth.user-registered",
            groupId = "marketplace-campaign-registration",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.UserRegisteredDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onUserRegistered(UserRegisteredDto e) {
        campaigns.claimOnRegistration(e.userId(), e.telegramId());
    }
}
