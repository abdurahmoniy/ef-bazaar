package uz.efbazaar.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.HashMap;
import java.util.Map;

/**
 * Telegram Login Widget callback payload.
 * Field names match Telegram's snake_case (mapped via @JsonProperty).
 */
public record TelegramLinkRequest(
        @NotNull Long id,
        @JsonProperty("first_name") String firstName,
        @JsonProperty("last_name") String lastName,
        String username,
        @JsonProperty("photo_url") String photoUrl,
        @JsonProperty("auth_date") @NotNull Long authDate,
        @NotBlank String hash
) {

    /** Convert to the flat map shape expected by {@code TelegramLoginValidator}. */
    public Map<String, String> toPayload() {
        Map<String, String> map = new HashMap<>();
        map.put("id", String.valueOf(id));
        map.put("auth_date", String.valueOf(authDate));
        map.put("hash", hash);
        if (firstName != null) map.put("first_name", firstName);
        if (lastName != null) map.put("last_name", lastName);
        if (username != null) map.put("username", username);
        if (photoUrl != null) map.put("photo_url", photoUrl);
        return map;
    }
}
