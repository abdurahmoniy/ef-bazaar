package uz.efbazaar.auth.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import uz.efbazaar.auth.service.TelegramProfile;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Optional;
import java.util.TreeMap;

/**
 * Telegram Mini App {@code initData} validator.
 *
 * <p>Algorithm (Telegram docs — distinct from Login Widget):
 * <pre>
 *   data_check_string = sorted "key=urldecoded_value" pairs joined by '\n' (hash excluded)
 *   secret_key        = HMAC-SHA256(key="WebAppData", msg=bot_token)
 *   expected_hash     = HMAC-SHA256(key=secret_key, msg=data_check_string)  // lowercase hex
 * </pre>
 *
 * <p>On success, parses the embedded {@code user} JSON and returns a {@link TelegramProfile}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramWebAppValidator {

    private static final long DEFAULT_MAX_AGE_SECONDS = 86_400L;

    private final ObjectMapper objectMapper;

    @Value("${app.telegram.bot-token:}")
    private String botToken;

    @Value("${app.telegram.login-max-age-seconds:" + DEFAULT_MAX_AGE_SECONDS + "}")
    private long maxAuthDateAgeSeconds;

    /**
     * Validates the {@code initData} string and returns the embedded user profile on success.
     * Returns {@link Optional#empty()} if the signature is invalid, expired, or malformed.
     */
    public Optional<TelegramProfile> validate(String initData) {
        if (botToken == null || botToken.isBlank()) {
            log.error("Telegram bot token not configured — cannot validate WebApp initData");
            return Optional.empty();
        }
        if (initData == null || initData.isBlank()) {
            return Optional.empty();
        }

        TreeMap<String, String> params = parseQuery(initData);
        String providedHash = params.remove("hash");
        if (providedHash == null || providedHash.isBlank()) {
            return Optional.empty();
        }

        String authDateRaw = params.get("auth_date");
        if (authDateRaw == null) {
            return Optional.empty();
        }
        long authDate;
        try {
            authDate = Long.parseLong(authDateRaw);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        long age = Instant.now().getEpochSecond() - authDate;
        if (age > maxAuthDateAgeSeconds) {
            log.warn("WebApp initData rejected: auth_date too old ({}s)", age);
            return Optional.empty();
        }

        String dataCheckString = buildDataCheckString(params);
        String expectedHash = computeHmacHex(dataCheckString);
        boolean match = MessageDigest.isEqual(
                providedHash.getBytes(StandardCharsets.UTF_8),
                expectedHash.getBytes(StandardCharsets.UTF_8));
        if (!match) {
            log.warn("WebApp initData hash mismatch");
            return Optional.empty();
        }

        String userJson = params.get("user");
        if (userJson == null) {
            log.warn("WebApp initData missing 'user' field");
            return Optional.empty();
        }
        return parseUser(userJson);
    }

    private static TreeMap<String, String> parseQuery(String query) {
        TreeMap<String, String> map = new TreeMap<>();
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq <= 0) continue;
            String key = pair.substring(0, eq);
            String value = URLDecoder.decode(pair.substring(eq + 1), StandardCharsets.UTF_8);
            map.put(key, value);
        }
        return map;
    }

    private static String buildDataCheckString(TreeMap<String, String> sorted) {
        StringBuilder sb = new StringBuilder();
        boolean first = true;
        for (var e : sorted.entrySet()) {
            if (!first) sb.append('\n');
            sb.append(e.getKey()).append('=').append(e.getValue());
            first = false;
        }
        return sb.toString();
    }

    private String computeHmacHex(String dataCheckString) {
        try {
            Mac secretMac = Mac.getInstance("HmacSHA256");
            secretMac.init(new SecretKeySpec("WebAppData".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] secret = secretMac.doFinal(botToken.getBytes(StandardCharsets.UTF_8));

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            byte[] hmac = mac.doFinal(dataCheckString.getBytes(StandardCharsets.UTF_8));
            return toHex(hmac);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot compute Telegram WebApp hash", e);
        }
    }

    private Optional<TelegramProfile> parseUser(String userJson) {
        try {
            JsonNode node = objectMapper.readTree(userJson);
            Long id = node.path("id").isNumber() ? node.path("id").asLong() : null;
            if (id == null) {
                return Optional.empty();
            }
            return Optional.of(new TelegramProfile(
                    id,
                    text(node, "first_name"),
                    text(node, "last_name"),
                    text(node, "username"),
                    text(node, "photo_url")));
        } catch (Exception e) {
            log.warn("WebApp user JSON parse failed: {}", e.getMessage());
            return Optional.empty();
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
