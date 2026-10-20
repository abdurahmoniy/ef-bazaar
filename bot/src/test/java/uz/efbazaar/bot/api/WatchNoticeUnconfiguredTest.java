package uz.efbazaar.bot.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers=WatchNoticeController.class)
@Import(WatchNoticeControllerTest.Stubs.class)
@TestPropertySource(properties="app.marketplace.secret=")
class WatchNoticeUnconfiguredTest {
    @Autowired MockMvc mvc;
    @BeforeEach void resetTelegram(){reset(WatchNoticeControllerTest.TELEGRAM);}
    @Test void anUnconfiguredSecretDisablesWatchDeliveryRatherThanOpeningTheEndpoint() throws Exception {
        mvc.perform(post("/bot/internal/watches/dm").header("X-Internal-Secret","anything")
          .contentType("application/json").content("{\"deliveryId\":\"d785ae86-197a-4bcc-96fb-9db07d87af0e\",\"chatId\":12345,\"text\":\"result\"}"))
          .andExpect(status().isServiceUnavailable());
        verifyNoInteractions(WatchNoticeControllerTest.TELEGRAM);
    }
}
