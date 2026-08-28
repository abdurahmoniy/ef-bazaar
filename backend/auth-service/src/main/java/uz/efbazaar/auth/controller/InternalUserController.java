package uz.efbazaar.auth.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserNamesBatchRequest;
import uz.efbazaar.auth.dto.UserSummaryBatchRequest;
import uz.efbazaar.auth.dto.UserSummaryResponse;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Server-to-server endpoint used by other efBazaar services (currently
 * marketplace-service) to resolve a batch of user IDs to display names —
 * e.g. to snapshot buyer/seller names on a Chat at creation time.
 *
 * <p>Auth: shared secret via {@code X-Internal-Secret}, enforced by
 * {@link uz.efbazaar.auth.security.InternalSecretFilter}. The path is also
 * blocked at nginx from the public network.
 *
 * <p>Behaviour: unknown IDs are simply omitted from the response map (the
 * caller falls back to a role label). No JWT is required.
 */
@RestController
@RequestMapping("/internal/auth/v1/users")
@RequiredArgsConstructor
public class InternalUserController {

    private final UserRepository userRepository;

    /**
     * Platform admins, as identity summaries.
     *
     * <p>Exists because notifications are per-user rows: a service that needs
     * to tell "the admins" something has no way to address them without a
     * roster, and roles live only here. Returns the same public projection as
     * {@code summary/batch} — ids and Telegram handles, no tokens or emails —
     * so a caller can write a notification row and send a direct message
     * without a second round trip.
     */
    @GetMapping("/admins")
    public List<UserSummaryResponse> admins() {
        return userRepository.findByRole(Role.ADMIN).stream()
                .map(UserSummaryResponse::from)
                .toList();
    }

    /**
     * Telegram chat id lari — ommaviy xabar yuborish uchun.
     *
     * <p>DIQQAT: telegramId borligi botga xabar YUBORISH mumkinligini
     * bildirmaydi. Telegram botga faqat o'zi bilan suhbat boshlagan odamga
     * yozishga ruxsat beradi; saytda Telegram Login orqali kirgan, lekin
     * botda /start bosmagan foydalanuvchi 403 qaytaradi. Ya'ni bu ro'yxat
     * "kimga urinib ko'rish mumkin", "kimga yetadi" emas.
     *
     * <p>Sahifalab qaytariladi — ro'yxat o'n minglab bo'lishi mumkin va
     * uni bitta javobga solish ikkala servisda ham xotirani band qiladi.
     */
    @GetMapping("/telegram-ids")
    public Page<Long> telegramIds(@RequestParam(defaultValue = "ALL") Audience audience,
                                  @PageableDefault(size = 500) Pageable pageable) {
        return switch (audience) {
            case ALL    -> userRepository.findTelegramIds(pageable);
            case ADMINS -> userRepository.findTelegramIdsByRole(Role.ADMIN, pageable);
            case USERS  -> userRepository.findTelegramIdsByRoleNot(Role.ADMIN, pageable);
        };
    }

    /**
     * Kimga yuborilsin.
     *
     * <p>Ajratish AYNAN SHU YERDA bo'ladi, chaqiruvchida emas: rollar
     * auth-service'ga tegishli va ular o'zgarganda faqat shu fayl
     * yangilanishi kerak. Bot rollar haqida hech narsa bilmaydi, u
     * tayyor manzillar ro'yxatini oladi.
     */
    public enum Audience { ALL, USERS, ADMINS }

    /**
     * Telegram chat id bo'yicha foydalanuvchi.
     *
     * <p>Bot faqat Telegram identifikatorlarini biladi — kanalga kim
     * qo'shganini `my_chat_member` shundan aytadi. Platformadagi arizani
     * unga bog'lash uchun oradagi ko'prik shu endpoint.
     *
     * @return topilmasa 404 emas, bo'sh javob: chaqiruvchi uchun "bunday
     *         foydalanuvchi yo'q" xatolik emas, oddiy natija.
     */
    @GetMapping("/by-telegram-id/{telegramId}")
    public ResponseEntity<UserSummaryResponse> byTelegramId(@PathVariable Long telegramId) {
        return userRepository.findByTelegramId(telegramId)
                .map(UserSummaryResponse::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/names/batch")
    public Map<UUID, String> resolveNames(@Valid @RequestBody UserNamesBatchRequest request) {
        Map<UUID, String> out = new LinkedHashMap<>();
        for (User user : userRepository.findAllById(request.ids())) {
            out.put(user.getId(), user.displayName());
        }
        return out;
    }

    /**
     * Richer projection than {@code names/batch} — identity summary for Gamer
     * Card aggregation and the Chempionat-X identity bridge. Lookup by UUID
     * and/or Telegram id; unknown ids are omitted, duplicates collapse.
     */
    @PostMapping("/summary/batch")
    public List<UserSummaryResponse> resolveSummaries(@Valid @RequestBody UserSummaryBatchRequest request) {
        if (request.isEmpty()) return List.of();
        Map<UUID, User> unique = new LinkedHashMap<>();
        if (request.ids() != null && !request.ids().isEmpty()) {
            for (User user : userRepository.findAllById(request.ids())) {
                unique.put(user.getId(), user);
            }
        }
        if (request.telegramIds() != null && !request.telegramIds().isEmpty()) {
            for (User user : userRepository.findByTelegramIdIn(request.telegramIds())) {
                unique.put(user.getId(), user);
            }
        }
        return unique.values().stream().map(UserSummaryResponse::from).toList();
    }
}
