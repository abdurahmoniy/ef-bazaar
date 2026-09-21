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
import java.util.UUID;

/**
 * Stand-in for the Python smart-admin-worker (Plan C). Consumes the four
 * request topics and synthesises the response topics so trade-service can
 * complete a full happy-path in {@code local} / {@code test} / {@code
 * mockworker} profiles.
 *
 * <p>Deliberately NOT tied to {@code docker} — {@code SPRING_PROFILES_ACTIVE}
 * is set to {@code docker} for every environment that runs via
 * docker-compose, including production. Gating on {@code docker} would mean
 * MockWorker silently answers Kafka provisioning requests in prod. Dev
 * environments opt in explicitly by adding {@code mockworker} to
 * {@code SPRING_PROFILES_ACTIVE} (see {@code .env.example}).
 */
@Slf4j
@Profile({"local", "test", "mockworker"})
@Component
@RequiredArgsConstructor
public class MockWorker {

    private final KafkaTemplate<String, Object> kafka;
    private final TradeCrypto crypto;
    private final SecureRandom rng = new SecureRandom();

    @org.springframework.beans.factory.annotation.Value("${trade.mailbox.domain:efbazaar.uz}")
    private String mailboxDomain;

    @KafkaListener(
            topics = TradeEvents.TOPIC_EMAIL_PROVISION_REQ,
            groupId = "mock-worker-provision",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$EmailProvisionRequest"}
    )
    public void onProvisionRequest(TradeEvents.EmailProvisionRequest req) {
        // Named after the mailbox, not the trade. A swap asks for two boxes on
        // one trade, and naming them after the trade gave both the same address
        // — mailboxes.email is unique, so the second insert threw inside the
        // listener and the partition spent its retries on a record that could
        // never succeed, stalling every trade behind it. The real worker names
        // them the same way; this is the mock catching up.
        UUID mailboxId = req.mailboxId();
        String email = "trade-" + mailboxId.toString().substring(0, 8) + "@efbazaar.uz";
        String pw = randomPassword();
        // Echo back the placeholder id trade-service supplied. Encryption
        // context stays on the mock-specific prefix so MailboxPasswordResolver's
        // fallback (`mbox-mock-{tradeId}`) still decrypts these rows for local
        // dev / integration tests.
        EncryptedField enc = crypto.encrypt("mbox-mock-" + req.tradeId(), pw.getBytes());
        kafka.send(TradeEvents.TOPIC_EMAIL_PROVISIONED, req.tradeId().toString(),
                new TradeEvents.EmailProvisioned(req.tradeId(), mailboxId, email,
                        enc.ciphertext(), enc.iv(), enc.tag()));
        log.info("MockWorker provisioned {} for trade {} as mailbox {}",
                email, req.tradeId(), mailboxId);
    }

    @KafkaListener(
            topics = TradeEvents.TOPIC_MAILBOX_PROVISION_REQ,
            groupId = "mock-worker-mailbox-provision",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$MailboxProvisionRequest"}
    )
    public void onMailboxProvisionRequest(TradeEvents.MailboxProvisionRequest req) {
        String email = req.localPart() + "@" + mailboxDomain;
        String pw = randomPassword();
        // Admin-created rows have no trade, so the mailbox-id context is the
        // only one MailboxPasswordResolver can try — use it verbatim (no
        // `mock-` prefix) or the row would be undecryptable in local dev.
        EncryptedField enc = crypto.encrypt("mbox-" + req.mailboxId(), pw.getBytes());
        kafka.send(TradeEvents.TOPIC_MAILBOX_PROVISIONED, req.mailboxId().toString(),
                new TradeEvents.MailboxProvisioned(req.mailboxId(), email,
                        enc.ciphertext(), enc.iv(), enc.tag()));
        log.info("MockWorker provisioned admin mailbox {} as {}", req.mailboxId(), email);
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
                    new TradeEvents.Imap2faCode(req.tradeId(), "123456", req.mailboxEmail(), Instant.now()));
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
