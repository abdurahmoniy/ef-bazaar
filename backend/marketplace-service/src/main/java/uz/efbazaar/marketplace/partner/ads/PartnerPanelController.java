package uz.efbazaar.marketplace.partner.ads;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.PartnerPanelResponse;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.UpdatePostPriceRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

/** Hamkorning o'z paneli — /api/v1/partners/panel. */
@RestController
@RequestMapping("/api/v1/partners/panel")
@RequiredArgsConstructor
public class PartnerPanelController {

    private final PartnerPanelService service;

    @GetMapping
    public PartnerPanelResponse panel(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.panelFor(user.userId());
    }

    /**
     * Post ko'rinishi — bloklar tartibi, yoqilganlik va footer.
     *
     * <p>Narxdan ALOHIDA endpoint: narx pul masalasi va tez-tez
     * o'zgaradi, ko'rinish esa bir marta sozlanadi. Bittaga qo'shsak,
     * narxni tuzatgan hamkor ko'rinishni ham beixtiyor qayta
     * yozib yuborardi.
     */
    @PutMapping("/post-settings")
    public PartnerPanelResponse updatePostSettings(@AuthenticationPrincipal AuthenticatedUser user,
                                                   @Valid @RequestBody PostSettingsRequest request) {
        return service.updatePostSettings(user.userId(), request.blocks(), request.footer());
    }

    public record PostSettingsRequest(java.util.List<String> blocks, String footer) {}

    @PutMapping("/price")
    public PartnerPanelResponse updatePrice(@AuthenticationPrincipal AuthenticatedUser user,
                                            @Valid @RequestBody UpdatePostPriceRequest request) {
        service.updatePostPrice(user.userId(), request.priceSom());
        return service.panelFor(user.userId());
    }
}
