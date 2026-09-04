package uz.efbazaar.marketplace.partner;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.partner.PartnerDtos.ApplicationResponse;
import uz.efbazaar.marketplace.partner.PartnerDtos.PartnerSettingsResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

/** Foydalanuvchi tomoni — hamkorlikka ariza. */
@RestController
@RequestMapping("/api/v1/partners")
@RequiredArgsConstructor
public class PartnerController {

    private final PartnerService service;

    /** Shartlar: minimal obunachi soni va narx. Ariza sahifasida ko'rsatiladi. */
    @GetMapping("/settings")
    public PartnerSettingsResponse settings() {
        return service.settingsResponse();
    }

    @GetMapping("/me")
    public ApplicationResponse myApplication(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.myApplication(user.userId()).map(ApplicationResponse::from).orElse(null);
    }

    /**
     * Hamkorlik to'lovini hamyondan yechadi.
     *
     * <p>Mablag' yetmasa 409 va xabarda yetishmayotgan summa — frontend
     * shundan hamyonni to'ldirish havolasini yasaydi.
     */
    @PostMapping("/pay")
    public ApplicationResponse pay(@AuthenticationPrincipal AuthenticatedUser user) {
        return ApplicationResponse.from(service.pay(user.userId()));
    }

    /**
     * Foydalanuvchi arizasini yoki hamkorligini bekor qiladi.
     *
     * <p>To'lov qaytarilmaydi — ekranda shu ochiq aytiladi.
     */
    @PostMapping("/cancel")
    public ApplicationResponse cancel(@AuthenticationPrincipal AuthenticatedUser user) {
        return ApplicationResponse.from(service.cancelByUser(user.userId()));
    }

    @PostMapping("/apply")
    public ApplicationResponse apply(@AuthenticationPrincipal AuthenticatedUser user) {
        return ApplicationResponse.from(service.apply(user.userId()));
    }
}
