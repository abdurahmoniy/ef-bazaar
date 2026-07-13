package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

/**
 * Stand-in for the Python smart-admin-worker (Plan C). Consumes the four
 * request topics and synthesises the response topics so trade-service can
 * complete a full happy-path in {@code local} / {@code test} / {@code docker}
 * profiles. NOT enabled in {@code prod}.
 */
@Slf4j
@Profile({"local", "test", "docker"})
@Component
@RequiredArgsConstructor
public class MockWorker {

    private final KafkaTemplate<String, Object> kafka;
    private final TradeCrypto crypto;
    private final SecureRandom rng = new SecureRandom();

    @KafkaListener(
            topics = TradeEvents.TOPIC_EMAIL_PROVISION_REQ,
            groupId = "mock-worker-provision",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$EmailProvisionRequest"}
    )
    public void onProvisionRequest(TradeEvents.EmailProvisionRequest req) {
        String email = "trade-" + req.tradeId().toString().substring(0, 8) + "@efbazaar.uz";
        String pw = randomPassword();
        EncryptedField enc = crypto.encrypt("mbox-mock-" + req.tradeId(), pw.getBytes());
        kafka.send(TradeEvents.TOPIC_EMAIL_PROVISIONED, req.tradeId().toString(),
                new TradeEvents.EmailProvisioned(req.tradeId(), email,
                        enc.ciphertext(), enc.iv(), enc.tag()));
        log.info("MockWorker provisioned {} for trade {}", email, req.tradeId());
    }

    @KafkaListener(
            topics = TradeEvents.TOPIC_FORGOT_PW_REQ,
            groupId = "mock-worker-forgot",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$ForgotPasswordRequest"}
    )
    public void onForgotPwRequest(TradeEvents.ForgotPasswordRequest req) {
        // The real worker triggers Konami's forgot-password. We simulate the successful IMAP
        // hit ~250 ms later, so trade lifecycle proceeds without human intervention.
        try {
            Thread.sleep(250);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            return;
        }
        kafka.send(TradeEvents.TOPIC_KONAMI_EMAIL, req.tradeId().toString(),
                new TradeEvents.KonamiEmailReceived(req.tradeId(), true,
                        "noreply@konami.com", Instant.now()));
        log.info("MockWorker synthesised konami-email for trade {}", req.tradeId());
    }

    @KafkaListener(
            topics = TradeEvents.TOPIC_IMAP_POLL_REQ,
            groupId = "mock-worker-poll",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$ImapPollRequest"}
    )
    public void onPollRequest(TradeEvents.ImapPollRequest req) {
        switch (req.purpose()) {
            case VERIFY_LINK -> kafka.send(TradeEvents.TOPIC_KONAMI_EMAIL, req.tradeId().toString(),
                    new TradeEvents.KonamiEmailReceived(req.tradeId(), true,
                            "noreply@konami.com", Instant.now()));
            case WAIT_2FA_CODE -> kafka.send(TradeEvents.TOPIC_IMAP_2FA, req.tradeId().toString(),
                    new TradeEvents.Imap2faCode(req.tradeId(), "123456", Instant.now()));
        }
    }

    @KafkaListener(
            topics = TradeEvents.TOPIC_MAILBOX_ROTATE_REQ,
            groupId = "mock-worker-rotate",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$MailboxRotateRequest"}
    )
    public void onRotateRequest(TradeEvents.MailboxRotateRequest req) {
        String pw = randomPassword();
        EncryptedField enc = crypto.encrypt("mbox-mock-rotate-" + req.mailboxId(), pw.getBytes());
        kafka.send(TradeEvents.TOPIC_MAILBOX_ROTATED, req.mailboxId().toString(),
                new TradeEvents.MailboxRotated(req.mailboxId(),
                        enc.ciphertext(), enc.iv(), enc.tag()));
    }

    private String randomPassword() {
        byte[] raw = new byte[16];
        rng.nextBytes(raw);
        return Base64.getEncoder().withoutPadding().encodeToString(raw);
    }
}
