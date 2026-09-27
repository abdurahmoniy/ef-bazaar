package uz.efbazaar.bot.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TradeActionNotificationConsumerTest {

    static class RecordingTelegramApiClient extends TelegramApiClient {
        record Call(String chatId, Integer threadId, String text, WebAppButton button) {}
        final List<Call> calls = new ArrayList<>();

        RecordingTelegramApiClient() {
            super(null, null);
        }

        @Override
        public Optional<Integer> sendMessage(String chatId, Integer threadId, String text, WebAppButton button) {
            calls.add(new Call(chatId, threadId, text, button));
            return Optional.of(123);
        }
    }

    private RecordingTelegramApiClient telegram;
    private TradeActionNotificationConsumer consumer;

    @BeforeEach
    void setUp() {
        telegram = new RecordingTelegramApiClient();
        consumer = new TradeActionNotificationConsumer(telegram);
        ReflectionTestUtils.setField(consumer, "webBaseUrl", "https://efbazaar.uz");
    }

    @Test
    void sendsTelegramDmOnProposalCreated() {
        UUID tradeId = UUID.randomUUID();
        UUID chatId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        TradeActionNotificationDto dto = new TradeActionNotificationDto(
                tradeId,
                chatId,
                userId,
                11223344L,
                "Ali",
                "PROPOSAL_CREATED",
                350_000L,
                null,
                "SALE",
                Instant.now()
        );

        consumer.onTradeAction(dto);

        assertThat(telegram.calls).hasSize(1);
        var call = telegram.calls.get(0);
        assertThat(call.chatId()).isEqualTo("11223344");
        assertThat(call.text()).contains("Yangi savdo taklifi!");
        assertThat(call.text()).contains("350 000 UZS");
        assertThat(call.button().url()).isEqualTo("https://efbazaar.uz/chats/" + chatId);
    }

    @Test
    void pureSwapNeverMentionsAnAmount() {
        UUID chatId = UUID.randomUUID();

        consumer.onTradeAction(new TradeActionNotificationDto(
                UUID.randomUUID(), chatId, UUID.randomUUID(), 11223344L, "Ali",
                "PROPOSAL_CREATED", 0L, null, "SWAP", Instant.now()));
        consumer.onTradeAction(new TradeActionNotificationDto(
                UUID.randomUUID(), chatId, UUID.randomUUID(), 11223344L, "Ali",
                "TRADE_STARTED", 0L, null, "SWAP", Instant.now()));

        assertThat(telegram.calls).hasSize(2);
        assertThat(telegram.calls).allSatisfy(call -> {
            assertThat(call.text()).doesNotContain("0 UZS");
            assertThat(call.text()).doesNotContain("UZS");
            // Sarlavhaning o'zi ham obmen deyishi kerak — "savdo taklifi" deb
            // kelgan xabar obmenni sotuvdek ko'rsatardi.
            assertThat(call.text()).doesNotContain("savdo taklifi");
            assertThat(call.text().toLowerCase()).contains("obmen");
        });
        assertThat(telegram.calls.get(0).text()).contains("Yangi obmen taklifi!");
        assertThat(telegram.calls.get(1).text()).contains("Obmen boshlandi!");
    }

    @Test
    void surchargeSwapIsCalledASwapAndStillShowsWhatIsPaid() {
        // Doplatali obmenda summa noldan katta, ya'ni faqat unga qarab
        // turini aniqlab bo'lmaydi — DM "Yangi savdo taklifi" deb kelardi.
        consumer.onTradeAction(new TradeActionNotificationDto(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 11223344L, "Ali",
                "PROPOSAL_CREATED", 120_000L, null, "SWAP_SURCHARGE", Instant.now()));
        consumer.onTradeAction(new TradeActionNotificationDto(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 11223344L, "Ali",
                "TRADE_STARTED", 120_000L, null, "SWAP_SURCHARGE", Instant.now()));

        assertThat(telegram.calls).hasSize(2);
        assertThat(telegram.calls).allSatisfy(call -> {
            assertThat(call.text()).doesNotContain("savdo taklifi");
            assertThat(call.text()).doesNotContain("Savdo boshlandi");
            assertThat(call.text().toLowerCase()).contains("obmen");
            // Doplata baribir ko'rinishi kerak: bu toza obmen emas.
            assertThat(call.text()).contains("120 000 UZS");
        });
        assertThat(telegram.calls.get(0).text()).contains("Yangi obmen taklifi!");
        assertThat(telegram.calls.get(1).text()).contains("Obmen boshlandi!");
    }

    @Test
    void oldEventsWithoutKindFallBackToTheAmount() {
        // Navbatda turgan eski hodisalarda `kind` yo'q. Sotuvda narx hech
        // qachon 0 bo'lmaydi, demak 0 summa obmen degani.
        consumer.onTradeAction(new TradeActionNotificationDto(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 11223344L, "Ali",
                "PROPOSAL_CREATED", 0L, null, null, Instant.now()));
        consumer.onTradeAction(new TradeActionNotificationDto(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 11223344L, "Ali",
                "PROPOSAL_CREATED", 350_000L, null, null, Instant.now()));

        assertThat(telegram.calls.get(0).text()).contains("Yangi obmen taklifi!");
        assertThat(telegram.calls.get(1).text()).contains("Yangi savdo taklifi!");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
        "WAITING_EMAIL_CHANGE,Emailni almashtiring",
        "VERIFYING_KONAMI_LINK,Konami tekshiruvini bajaring",
        "WAITING_PASSWORD,Konami parolini yuboring",
        "WAITING_BUYER_VERIFY,Akkountni tekshiring",
        "WAITING_ADMIN,Adminni tanlang",
        "WAITING_CLOSE_CONFIRM,Savdoni tasdiqlang",
        "<script>,Savdoni davom ettirish uchun chatga kiring"
    })
    void turnMessageIncludesTheNextActionAndTradeButton(String step, String instruction) {
        UUID chat = UUID.randomUUID();
        consumer.onTradeAction(new TradeActionNotificationDto(UUID.randomUUID(), chat, UUID.randomUUID(),
                11223344L, "Ali", "YOUR_TURN", 0L, step, "SWAP", Instant.now()));
        assertThat(telegram.calls).hasSize(1);
        var call = telegram.calls.getFirst();
        assertThat(call.text()).contains("Sizning navbatingiz", instruction).doesNotContain("<script>");
        assertThat(call.button().url()).isEqualTo("https://efbazaar.uz/chats/" + chat);
        assertThat(call.chatId()).isEqualTo("11223344");
    }

    @Test
    void dropsWhenNoTelegramId() {
        TradeActionNotificationDto dto = new TradeActionNotificationDto(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                null,
                "Ali",
                "TRADE_SUCCESS",
                100_000L,
                null,
                "SALE",
                Instant.now()
        );

        consumer.onTradeAction(dto);

        assertThat(telegram.calls).isEmpty();
    }
}
