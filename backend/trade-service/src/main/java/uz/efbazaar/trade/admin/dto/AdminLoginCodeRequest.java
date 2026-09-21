package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import uz.efbazaar.trade.trade.domain.ParticipantRole;

/**
 * Admin pochtadan o'qigan Konami KIRISH kodi — worker o'qib bera olmaganda.
 *
 * @param role kod KIMGA kerakligi: akkountni qabul qilayotgan taraf.
 *             Sotuvda bu xaridor, obmenda esa ikkalasiga ham o'z kodi keladi.
 */
public record AdminLoginCodeRequest(
        @NotNull ParticipantRole role,
        @NotBlank @Pattern(regexp = "\\d{4,8}", message = "Kod 4–8 ta raqamdan iborat bo'lishi kerak")
        String code) {}
