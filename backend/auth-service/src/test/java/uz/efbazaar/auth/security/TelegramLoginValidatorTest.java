package uz.efbazaar.auth.security;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.TreeMap;

import static org.assertj.core.api.Assertions.assertThat;

class TelegramLoginValidatorTest {

    private static final String BOT_TOKEN = "1234567890:test-bot-token-for-unit-tests";

    @Test
    void validPayload_returnsTrue() {
        TelegramLoginValidator validator = new TelegramLoginValidator(BOT_TOKEN, 86400);
        Map<String, String> payload = signedPayload(BOT_TOKEN, sampleFields(Instant.now().getEpochSecond()));
        assertThat(validator.isValid(payload)).isTrue();
    }

    @Test
    void tamperedField_returnsFalse() {
        TelegramLoginValidator validator = new TelegramLoginValidator(BOT_TOKEN, 86400);
        Map<String, String> payload = signedPayload(BOT_TOKEN, sampleFields(Instant.now().getEpochSecond()));
        payload.put("first_name", "Mallory");  // tamper after signing
        assertThat(validator.isValid(payload)).isFalse();
    }

    @Test
    void expiredAuthDate_returnsFalse() {
        TelegramLoginValidator validator = new TelegramLoginValidator(BOT_TOKEN, 60);
        long oldDate = Instant.now().getEpochSecond() - 3600;  // 1 hour ago, max 60s
        Map<String, String> payload = signedPayload(BOT_TOKEN, sampleFields(oldDate));
        assertThat(validator.isValid(payload)).isFalse();
    }

    @Test
    void wrongBotToken_returnsFalse() {
        TelegramLoginValidator validator = new TelegramLoginValidator(BOT_TOKEN, 86400);
        // Sign with a different token
        Map<String, String> payload = signedPayload("different-token", sampleFields(Instant.now().getEpochSecond()));
        assertThat(validator.isValid(payload)).isFalse();
    }

    @Test
    void missingHash_returnsFalse() {
        TelegramLoginValidator validator = new TelegramLoginValidator(BOT_TOKEN, 86400);
        Map<String, String> payload = new HashMap<>(sampleFields(Instant.now().getEpochSecond()));
        assertThat(validator.isValid(payload)).isFalse();
    }

    @Test
    void missingBotToken_returnsFalse() {
        TelegramLoginValidator validator = new TelegramLoginValidator("", 86400);
        Map<String, String> payload = signedPayload(BOT_TOKEN, sampleFields(Instant.now().getEpochSecond()));
        assertThat(validator.isValid(payload)).isFalse();
    }

    // ----- helpers -----

    private static Map<String, String> sampleFields(long authDate) {
        Map<String, String> m = new HashMap<>();
        m.put("id", "123456789");
        m.put("first_name", "Alice");
        m.put("username", "alice");
        m.put("auth_date", String.valueOf(authDate));
        return m;
    }

    private static Map<String, String> signedPayload(String botToken, Map<String, String> fields) {
        Map<String, String> payload = new HashMap<>(fields);
        payload.put("hash", computeHash(botToken, payload));
        return payload;
    }

    private static String computeHash(String botToken, Map<String, String> payload) {
        TreeMap<String, String> sorted = new TreeMap<>(payload);
        sorted.remove("hash");
        StringBuilder dcs = new StringBuilder();
        boolean first = true;
        for (var e : sorted.entrySet()) {
            if (!first) dcs.append('\n');
            dcs.append(e.getKey()).append('=').append(e.getValue());
            first = false;
        }
        try {
            byte[] secret = MessageDigest.getInstance("SHA-256")
                    .digest(botToken.getBytes(StandardCharsets.UTF_8));
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] hmac = mac.doFinal(dcs.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hmac.length * 2);
            for (byte b : hmac) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
