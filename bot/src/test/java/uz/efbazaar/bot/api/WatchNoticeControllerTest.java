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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.bot.telegram.TelegramApiClient;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers=WatchNoticeController.class)
@Import(WatchNoticeControllerTest.Stubs.class)
@TestPropertySource(properties="app.marketplace.secret=watch-test-secret")
class WatchNoticeControllerTest {
    static final TelegramApiClient TELEGRAM=mock(TelegramApiClient.class);
    @TestConfiguration static class Stubs { @Bean TelegramApiClient telegram(){return TELEGRAM;} }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @BeforeEach void resetTelegram(){reset(TELEGRAM);}
    private Map<String,Object> request(String text){return Map.of("deliveryId",UUID.randomUUID(),"chatId",12345L,"text",text);}
    @Test void aWatchMessageRequiresTheInternalSecret() throws Exception {
        String body=json.writeValueAsString(request("New watch result"));
        mvc.perform(post("/bot/internal/watches/dm").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isForbidden());
        mvc.perform(post("/bot/internal/watches/dm").header("X-Internal-Secret","wrong")
            .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        verifyNoInteractions(TELEGRAM);
    }
    @Test void plainTextIsEscapedAndConfirmedMessageIdIsReturned() throws Exception {
        when(TELEGRAM.sendMessage(eq("12345"),isNull(),anyString())).thenReturn(Optional.of(789));
        mvc.perform(post("/bot/internal/watches/dm").header("X-Internal-Secret","watch-test-secret")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(request("<b>Messi & friends</b>"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.messageId").value(789));
        verify(TELEGRAM).sendMessage("12345",null,"&lt;b&gt;Messi &amp; friends&lt;/b&gt;");
    }
    @Test void unknownTelegramOutcomeNeverClaimsConfirmedDelivery() throws Exception {
        when(TELEGRAM.sendMessage(anyString(),isNull(),anyString())).thenReturn(Optional.empty());
        mvc.perform(post("/bot/internal/watches/dm").header("X-Internal-Secret","watch-test-secret")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(request("Result"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.messageId").doesNotExist());
        verify(TELEGRAM,times(1)).sendMessage(anyString(),isNull(),anyString());
    }
    @Test void invalidOrOversizedRequestsNeverContactTelegram() throws Exception {
        var invalid=java.util.List.of(Map.of("chatId",12345,"text","result"),
            Map.of("deliveryId",UUID.randomUUID(),"chatId",-100,"text","result"),
            Map.of("deliveryId","not-a-uuid","chatId",12345,"text","result"),request("  "),request("x".repeat(3501)));
        for(var body:invalid) mvc.perform(post("/bot/internal/watches/dm").header("X-Internal-Secret","watch-test-secret")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))).andExpect(status().isBadRequest());
        verifyNoInteractions(TELEGRAM);
    }
}
