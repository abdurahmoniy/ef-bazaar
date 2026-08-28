package uz.efbazaar.marketplace.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Kod ataylab qaytargan holat va xabar mijozga o'zgarmasdan yetib borishi.
 *
 * <p>Bu sinov haqiqiy nosozlikdan keyin yozildi: {@code ResponseStatusException}
 * uchun handler yo'q edi, u {@code Exception.class} ga tushardi va HAR BIRI
 * 500 "Ichki xatolik" bo'lib qaytardi. Servis ichida yozilgan aniq xabarlar —
 * uzunlik chegarasi, yetmagan mablag', band jo'natma — foydalanuvchiga hech
 * qachon ko'rinmagan, frontend esa ularni matn bo'yicha tanishga urinardi.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    private Map<String, Object> bodyOf(ResponseEntity<Map<String, Object>> response) {
        return response.getBody();
    }

    @Test
    @DisplayName("409 va uning sababi o'zgarmasdan qaytadi")
    void keepsStatusAndReason() {
        var response = handler.onStatus(new ResponseStatusException(
                HttpStatus.CONFLICT, "Hamyonda mablag' yetarli emas — 120000 so'm yetishmayapti"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        // Frontend yetishmayotgan summani AYNAN shu matndan oladi va
        // hamyonni to'ldirish havolasini yasaydi.
        assertThat(bodyOf(response)).containsEntry("message",
                "Hamyonda mablag' yetarli emas — 120000 so'm yetishmayapti");
        assertThat(bodyOf(response)).containsEntry("status", 409);
    }

    @Test
    @DisplayName("400 ham o'z holatini saqlaydi")
    void keepsBadRequest() {
        var response = handler.onStatus(new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Matn 1200 belgi"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(bodyOf(response)).containsEntry("message", "Matn 1200 belgi");
    }

    @Test
    @DisplayName("Sababsiz istisnoda standart matn ishlatiladi")
    void fallsBackToTheReasonPhrase() {
        var response = handler.onStatus(new ResponseStatusException(HttpStatus.NOT_FOUND));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(bodyOf(response).get("message")).isEqualTo("Not Found");
    }

    @Test
    @DisplayName("5xx o'z holatida qoladi")
    void keepsServerErrors() {
        var response = handler.onStatus(new ResponseStatusException(
                HttpStatus.BAD_GATEWAY, "Telegramga yuklab bo'lmadi"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(bodyOf(response)).containsEntry("message", "Telegramga yuklab bo'lmadi");
    }
}
