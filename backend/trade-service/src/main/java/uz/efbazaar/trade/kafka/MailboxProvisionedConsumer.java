package uz.efbazaar.trade.kafka;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.mailbox.service.MailboxService;

/**
 * Closes the loop on an admin-registered mailbox: the worker created the box in
 * Mailcow, so store the real encrypted password and stamp {@code provisioned_at}.
 *
 * <p>No trade state machine involved — that is the whole difference from
 * {@link EmailProvisionedConsumer}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MailboxProvisionedConsumer {

    private final MailboxService mailboxes;
    private final uz.efbazaar.trade.mailbox.provision.ProvisioningClaimService claims;

    @KafkaListener(
            topics = TradeEvents.TOPIC_MAILBOX_PROVISIONED,
            groupId = "trade-service-mailbox-provisioned",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$MailboxProvisioned"}
    )
    public void onMailboxProvisioned(TradeEvents.MailboxProvisioned e) {
        try {
            var completion = claims.complete(e.mailboxId(), null, e.mailboxEmail(), e.encryptedPassword(), e.iv(), e.tag(), e.claimId());
            if (completion == uz.efbazaar.trade.mailbox.provision.ProvisioningClaimService.Completion.REJECTED) return;
            if (completion == uz.efbazaar.trade.mailbox.provision.ProvisioningClaimService.Completion.LEGACY)
                mailboxes.markProvisioned(e.mailboxId(), e.mailboxEmail(), e.encryptedPassword(), e.iv(), e.tag());
            log.info("Mailbox {} provisioned as {}", e.mailboxId(), e.mailboxEmail());
        } catch (EntityNotFoundException ex) {
            // The row is created before the request is published, so this only
            // happens if an admin deleted it mid-flight (or a stale replay after
            // a DB reset). Nothing to repair — log and move the offset on rather
            // than crash-looping the listener.
            log.warn("mailbox-provisioned for unknown mailbox {} — dropping", e.mailboxId());
        }
    }
}
