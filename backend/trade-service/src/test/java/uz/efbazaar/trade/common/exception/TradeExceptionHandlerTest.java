package uz.efbazaar.trade.common.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.plan.exception.MailboxSlotsExhaustedException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Xato javoblarining SHAKLI.
 *
 * <p>Frontend xato matnini faqat {@code message} yoki {@code error}
 * dan o'qiydi. Sabab boshqa maydonda yotsa, foydalanuvchi umumiy
 * "So'rov bajarilmadi" ni ko'radi — server esa aniq nima bo'lganini
 * bilib turadi. Aynan shu holat production'da savdoni to'sib qo'ygan
 * va logda hech qanday iz qoldirmagan.
 */
class TradeExceptionHandlerTest {

    private final TradeExceptionHandler handler = new TradeExceptionHandler();

    @Test
    @DisplayName("slot tugaganda sabab message'da keladi, detail'da yashirinmaydi")
    void slotsExhaustedCarriesAReadableMessage() {
        var response = handler.onSlotsExhausted(
                new MailboxSlotsExhaustedException("STANDARD", 6, 3));

        Map<String, Object> body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("message")).asString().contains("6").contains("3");
        assertThat(body.get("error")).isNotNull();
    }

    @Test
    @DisplayName("raqamlar ham beriladi — ekran ikkala chiqish yo'lini taklif qiladi")
    void slotsExhaustedCarriesTheNumbers() {
        // Ikki yo'l bor: eskisini o'chirish yoki rejani ko'tarish.
        // Ekran qaysi birini taklif qilishni matnni o'qib emas,
        // raqamlarga qarab hal qiladi.
        var body = handler.onSlotsExhausted(
                new MailboxSlotsExhaustedException("STANDARD", 6, 3)).getBody();

        assertThat(body).containsEntry("used", 6L)
                .containsEntry("limit", 3L)
                .containsEntry("plan", "STANDARD")
                .containsEntry("code", "mailbox_slots_exhausted");
    }
}
