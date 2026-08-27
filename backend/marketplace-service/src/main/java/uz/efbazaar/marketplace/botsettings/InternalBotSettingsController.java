package uz.efbazaar.marketplace.botsettings;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.botsettings.BotSettingsDtos.BotSettingsResponse;

/**
 * Bot shu endpointdan /start matnini o'qiydi.
 *
 * <p>{@code X-Internal-Secret} bilan himoyalangan (InternalSecretFilter) va
 * nginx {@code /internal/} prefiksini tashqaridan bloklaydi.
 *
 * <p>Bot buni har chaqiruvda emas, keshlab so'raydi va oxirgi muvaffaqiyatli
 * javobni xotirasida saqlaydi — bu servis yiqilsa ham /start ishlayveradi.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/bot-settings")
@RequiredArgsConstructor
public class InternalBotSettingsController {

    private final BotSettingsService service;

    @GetMapping
    public BotSettingsResponse get() {
        return BotSettingsResponse.from(service.get());
    }
}
