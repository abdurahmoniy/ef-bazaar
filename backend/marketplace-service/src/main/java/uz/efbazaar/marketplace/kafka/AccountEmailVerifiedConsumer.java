package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.account.ListingAccountLink;

/**
 * trade-service proved a Konami account is on one of the user's boxes: the
 * account gets the address and the verified mark.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AccountEmailVerifiedConsumer {

    private final ListingAccountLink accounts;

    @KafkaListener(
            topics = "efbazaar.trade.account-email-verified",
            groupId = "marketplace-account-email-verified",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.AccountEmailVerifiedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    public void onVerified(AccountEmailVerifiedDto e) {
        if (e == null || e.accountId() == null || e.ownerId() == null || e.email() == null) {
            log.warn("account-email-verified without account, owner or email — skipped");
            return;
        }
        accounts.applyVerifiedEmail(e);
    }
}
