package uz.efbazaar.auth.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Map;
import java.util.TreeMap;

/**
 * Telegram Login Widget hash validator.
 *
 * <p>Algorithm (Telegram docs):
 * <pre>
 *   data_check_string = sorted "key=value" pairs joined by '\n' (hash excluded)
 *   secret_key        = SHA-256(bot_token)
 *   expected_hash     = HMAC-SHA256(secret_key, data_check_string)  // lowercase hex
 * </pre>
 *
 * <p>Reference: Chempionat-X TelegramLoginValidator (same algorithm).
 */
@Slf4j
@Component
public class TelegramLoginValidator {

    private static final long DEFAULT_MAX_AGE_SECONDS = 86_400L; // 24h

    private final String botToken;
    private final long maxAuthDateAgeSeconds;

    public TelegramLoginValidator(
            @Value("${app.telegram.bot-token:}") String botToken,
            @Value("${app.telegram.login-max-age-seconds:" + DEFAULT_MAX_AGE_SECONDS + "}")
                    long maxAuthDateAgeSeconds) {
        this.botToken = botToken;
        this.maxAuthDateAgeSeconds = maxAuthDateAgeSeconds;
    }

    public boolean isValid(Map<String, String> payload) {
        if (botToken == null || botToken.isBlank()) {
            log.error("Telegram bot token not configured — cannot validate login");
            return false;
        }
        if (payload == null || !payload.containsKey("hash") || !payload.containsKey("auth_date")) {
            return false;
        }

        long authDate;
        try {
            authDate = Long.parseLong(payload.get("auth_date"));
        } catch (NumberFormatException e) {
            return false;
        }

        long age = Instant.now().getEpochSecond() - authDate;
        if (age > maxAuthDateAgeSeconds) {
            log.warn("Telegram login rejected: auth_date too old ({}s)", age);
            return false;
        }

        String providedHash = payload.get("hash");
        String dataCheckString = buildDataCheckString(payload);
        String expectedHash = computeHmacHex(dataCheckString);

        boolean match = MessageDigest.isEqual(
                providedHash.getBytes(StandardCharsets.UTF_8),
                expectedHash.getBytes(StandardCharsets.UTF_8));
        if (!match) {
            log.warn("Telegram login hash mismatch");
        }
        return match;
    }

    private String buildDataCheckString(Map<String, String> payload) {
        TreeMap<String, String> sorted = new TreeMap<>(payload);
        sorted.remove("hash");
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, String> e : sorted.entrySet()) {
            if (!first) sb.append('\n');
            sb.append(e.getKey()).append('=').append(e.getValue());
            first = false;
        }
        return sb.toString();
    }

    private String computeHmacHex(String dataCheckString) {
        try {
            byte[] secret = MessageDigest.getInstance("SHA-256")
                    .digest(botToken.getBytes(StandardCharsets.UTF_8));
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] hmac = mac.doFinal(dataCheckString.getBytes(StandardCharsets.UTF_8));
            return toHex(hmac);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot compute Telegram login hash", e);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
