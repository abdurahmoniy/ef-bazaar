package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Marketplace chat tarixini tozalashdan oldin shu yerdan so'raydi.
 *
 * <p>Javob noto'g'ri bo'lsa ikki xil zarar bor: "tirik emas" deb aldasa,
 * savdo o'rtasida kelishuv yozishmasi yo'qoladi; "tirik" deb aldasa,
 * odam chatini hech qachon tozalay olmaydi.
 */
@SpringBootTest
@AutoConfigureMockMvc
class InternalTradeControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeRepository trades;
    @Autowired MailboxRepository mailboxes;

    @Value("${app.internal.secret:}") String secret;

    private UUID tradeInChat(UUID chatId, TradeState state) {
        // Savdo qutisiz ochilmaydi — sxemada `mailbox_id` majburiy.
        UUID box = UUID.randomUUID();
        mailboxes.saveAndFlush(Mailbox.builder()
                .id(box)
                .email("live-check-" + box + "@efbazaar.uz")
                .encryptedPassword(new byte[]{1})
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .createdAt(Instant.now())
                .build());
        Trade t = trades.saveAndFlush(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(state)
                .chatId(chatId)
                .mailboxId(box)
                .mode(TradeMode.SMART)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        return t.getId();
    }

    @Test
    void anUnfinishedTradeMakesTheChatLive() throws Exception {
        UUID chatId = UUID.randomUUID();
        tradeInChat(chatId, TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(get("/internal/trades/live").param("chatId", chatId.toString())
                        .header("X-Internal-Secret", secret))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.live").value(true));
    }

    @Test
    void aFinishedTradeDoesNotHoldTheChat() throws Exception {
        // Yakunlangan savdo tarixni abadiy qulflab qo'ymasligi kerak —
        // aks holda bir marta savdo qilgan juftlik chatini hech qachon
        // tozalay olmasdi.
        UUID chatId = UUID.randomUUID();
        tradeInChat(chatId, TradeState.SUCCESS);

        mvc.perform(get("/internal/trades/live").param("chatId", chatId.toString())
                        .header("X-Internal-Secret", secret))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.live").value(false));
    }

    @Test
    void aChatWithNoTradesIsNotLive() throws Exception {
        mvc.perform(get("/internal/trades/live").param("chatId", UUID.randomUUID().toString())
                        .header("X-Internal-Secret", secret))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.live").value(false));
    }

    @Test
    void withoutTheSharedSecretTheEndpointIsClosed() throws Exception {
        // Sir bo'lmasa javob berilmaydi: bu yo'lda foydalanuvchi
        // autentifikatsiyasi yo'q, ya'ni sir yagona qo'riqchi.
        mvc.perform(get("/internal/trades/live").param("chatId", UUID.randomUUID().toString()))
                .andExpect(status().isForbidden());
    }
}
