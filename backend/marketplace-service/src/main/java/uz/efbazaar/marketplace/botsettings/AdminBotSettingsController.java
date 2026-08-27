package uz.efbazaar.marketplace.botsettings;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.botsettings.BotSettingsDtos.BotSettingsResponse;
import uz.efbazaar.marketplace.botsettings.BotSettingsDtos.UpdateBotSettingsRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

/** Adminka "Bot" bo'limi — /api/v1/admin/** SecurityConfig'da ROLE_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/bot-settings")
@RequiredArgsConstructor
public class AdminBotSettingsController {

    private final BotSettingsService service;

    @GetMapping
    public BotSettingsResponse get() {
        return BotSettingsResponse.from(service.get());
    }

    @PutMapping
    public BotSettingsResponse update(@Valid @RequestBody UpdateBotSettingsRequest request,
                                      @AuthenticationPrincipal AuthenticatedUser admin) {
        return BotSettingsResponse.from(service.updateWelcomeText(request, admin.userId()));
    }

    @PostMapping(value = "/banner", consumes = "multipart/form-data")
    public BotSettingsResponse uploadBanner(@RequestParam("file") MultipartFile file,
                                            @AuthenticationPrincipal AuthenticatedUser admin) {
        return BotSettingsResponse.from(service.updateBanner(file, admin.userId()));
    }

    @DeleteMapping("/banner")
    public BotSettingsResponse removeBanner(@AuthenticationPrincipal AuthenticatedUser admin) {
        return BotSettingsResponse.from(service.removeBanner(admin.userId()));
    }
}
