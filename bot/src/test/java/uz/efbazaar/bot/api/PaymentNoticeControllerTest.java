package uz.efbazaar.bot.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
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
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PaymentNoticeController.class)
@Import(PaymentNoticeControllerTest.Stubs.class)
class PaymentNoticeControllerTest {

    static final TelegramApiClient TELEGRAM = mock(TelegramApiClient.class);

    @TestConfiguration
    static class Stubs {
        @Bean TelegramApiClient telegram() { return TELEGRAM; }
        @Bean TelegramProperties props() {
            return new TelegramProperties("t", "u", "https://api.telegram.org", "-100777",
                    new TelegramProperties.Topics(6, 4, 2, 11), null, null);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    @BeforeEach
    void resetMock() {
        reset(TELEGRAM);
    }

    @Test
    void postsIntoThePaymentsTopicAndReturnsTheMessageId() throws Exception {
        when(TELEGRAM.sendMessage(eq("-100777"), eq(11), anyString())).thenReturn(Optional.of(4242));

        mvc.perform(post("/bot/internal/payments/notice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", "<b>salom</b>"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messageId").value(4242));
    }

    @Test
    void reportsNullWhenTelegramRefuses() throws Exception {
        when(TELEGRAM.sendMessage(anyString(), any(), anyString())).thenReturn(Optional.empty());

        mvc.perform(post("/bot/internal/payments/notice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", "salom"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messageId").doesNotExist());
    }

    @Test
    void rejectsBlankText() throws Exception {
        mvc.perform(post("/bot/internal/payments/notice")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("text", "  "))))
                .andExpect(status().isBadRequest());
        verify(TELEGRAM, never()).sendMessage(anyString(), any(), anyString());
    }

    @Test
    void deleteReturnsNoContent() throws Exception {
        when(TELEGRAM.deleteMessage(eq("-100777"), anyLong())).thenReturn(true);

        mvc.perform(post("/bot/internal/payments/notice/delete")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("messageId", 4242))))
                .andExpect(status().isNoContent());

        verify(TELEGRAM).deleteMessage("-100777", 4242L);
    }
}
