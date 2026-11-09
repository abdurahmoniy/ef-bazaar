package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SellerSummaryTest {

    @Test
    @DisplayName("a listing's seller never exposes the Telegram handle, even to anonymous visitors")
    void noTelegramHandle() throws Exception {
        var summary = new AuthSummaryClient.UserSummary(
                UUID.randomUUID(), "Ali", "ali_seller", 5L, true, Instant.parse("2026-01-01T00:00:00Z"), true);

        String json = new ObjectMapper().registerModule(new JavaTimeModule())
                .writeValueAsString(SellerSummary.from(summary));

        assertThat(json).doesNotContain("ali_seller").doesNotContain("telegramUsername");
        assertThat(json).contains("\"displayName\":\"Ali\"");
    }
}
