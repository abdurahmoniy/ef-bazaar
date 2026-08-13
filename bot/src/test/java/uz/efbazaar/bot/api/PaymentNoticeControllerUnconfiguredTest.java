package uz.efbazaar.bot.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.bot.config.TelegramProperties;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A platform deployed without an admin payments topic must still take deposits.
 * An unset {@code TELEGRAM_TOPIC_PAYMENTS} arrives as an empty string, which
 * Spring binds to a null {@code Integer} — the notice is skipped, and in
 * particular it never falls back to the group's General thread (thread id
 * absent), which would put user ids in front of the whole group.
 */
@WebMvcTest(controllers = PaymentNoticeController.class)
@Import(PaymentNoticeControllerUnconfiguredTest.Stubs.class)
class PaymentNoticeControllerUnconfiguredTest {

    static final TelegramApiClient TELEGRAM = mock(TelegramApiClient.class);

    @TestConfiguration
    static class Stubs {
        @Bean TelegramApiClient telegram() { return TELEGRAM; }
        @Bean TelegramProperties props() {
            return new TelegramProperties("t", "u", "https://api.telegram.org", "-100777",
                    new TelegramProperties.Topics(6, 4, 2, null), null, null);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @Test
    void anUnsetTopicSkipsTheNoticeInsteadOfPostingToGeneral() throws Exception {
        mvc.perform(post("/bot/internal/payments/notice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", "salom"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messageId").doesNotExist());

        verify(TELEGRAM, never()).sendMessage(anyString(), any(), anyString());
    }

    @Test
    void anUnsetTopicSkipsTheDeleteToo() throws Exception {
        mvc.perform(post("/bot/internal/payments/notice/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("messageId", 4242))))
                .andExpect(status().isNoContent());

        verify(TELEGRAM, never()).deleteMessage(anyString(), anyLong());
    }
}
