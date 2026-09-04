package uz.efbazaar.marketplace.partner;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.partner.PartnerApplication.Status;
import uz.efbazaar.marketplace.partner.PartnerDtos.ApplicationResponse;
import uz.efbazaar.marketplace.partner.PartnerDtos.PartnerSettingsResponse;
import uz.efbazaar.marketplace.partner.PartnerDtos.ReviewRequest;
import uz.efbazaar.marketplace.partner.PartnerDtos.UpdatePartnerSettingsRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.UUID;

/** Adminka "Hamkorlar" bo'limi — /api/v1/admin/** SecurityConfig'da ROLE_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/partners")
@RequiredArgsConstructor
public class AdminPartnerController {

    private final PartnerService service;
    private final uz.efbazaar.marketplace.partner.ads.PartnerAnalyticsService analytics;
    private final AdminBadgeService badges;

    /**
     * Kanal kesimidagi voronka: bosilish → ro'yxat → post → daromad.
     *
     * <p>Bitta daromad ustuni adminga kanal nima uchun ishlamayotganini
     * ayta olmaydi — ko'p bosilib savdosiz qolgani boshqa muammo,
     * umuman bosilmagani boshqa.
     */
    /** Sozlash tabi: har bir kanalning o'z sharti va amaldagi shart. */
    @GetMapping("/channels")
    public java.util.List<uz.efbazaar.marketplace.partner.PartnerDtos.ChannelPayoutRow> channels() {
        return service.channelPayouts();
    }

    /**
     * Bitta kanalga alohida shart.
     *
     * <p>Bo'sh maydon globalga ergashishni bildiradi — o'sha kunning
     * global qiymatini NUSXALAMAYDI, aks holda admin keyin global
     * sozlamani o'zgartirganda bu kanal eski shartda qolib ketardi.
     */
    @PutMapping("/channels/{channelId}/payout")
    public java.util.List<uz.efbazaar.marketplace.partner.PartnerDtos.ChannelPayoutRow> updateChannelPayout(
            @PathVariable UUID channelId,
            @Valid @RequestBody uz.efbazaar.marketplace.partner.PartnerDtos.UpdateChannelPayoutRequest request,
            @AuthenticationPrincipal AuthenticatedUser admin) {
        service.updateChannelPayout(channelId, request, admin.userId());
        return service.channelPayouts();
    }

    @GetMapping("/analytics")
    public java.util.List<uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.PartnerFunnelRow> analytics() {
        return analytics.funnel();
    }

    @GetMapping("/settings")
    public PartnerSettingsResponse settings() {
        return service.settingsResponse();
    }

    @PutMapping("/settings")
    public PartnerSettingsResponse updateSettings(@Valid @RequestBody UpdatePartnerSettingsRequest request,
                                                  @AuthenticationPrincipal AuthenticatedUser admin) {
        service.updateSettings(request, admin.userId());
        return service.settingsResponse();
    }

    @GetMapping("/applications")
    public PageResponse<ApplicationResponse> applications(
            @RequestParam(required = false) Status status,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.from(service.list(status, pageable), ApplicationResponse::from);
    }

    @PostMapping("/applications/{id}/approve")
    public ApplicationResponse approve(@PathVariable UUID id,
                                       @RequestBody(required = false) ReviewRequest body,
                                       @AuthenticationPrincipal AuthenticatedUser admin) {
        return ApplicationResponse.from(
                service.approve(id, admin.userId(), body == null ? null : body.note()));
    }

    @PostMapping("/applications/{id}/reject")
    public ApplicationResponse reject(@PathVariable UUID id,
                                      @RequestBody(required = false) ReviewRequest body,
                                      @AuthenticationPrincipal AuthenticatedUser admin) {
        return ApplicationResponse.from(
                service.reject(id, admin.userId(), body == null ? null : body.note()));
    }

    /** Hamkorlikni yoki arizani admin tomonidan to'xtatish. */
    @PostMapping("/applications/{id}/cancel")
    public ApplicationResponse cancel(@PathVariable UUID id,
                                      @RequestBody(required = false) ReviewRequest body,
                                      @AuthenticationPrincipal AuthenticatedUser admin) {
        return ApplicationResponse.from(
                service.cancelByAdmin(id, admin.userId(), body == null ? null : body.note()));
    }

    /**
     * Admin arizalar ro'yxatini ochdi — ishora o'chadi.
     *
     * <p>Alohida chaqiruv, ro'yxatni o'qish bilan birga emas: ro'yxat
     * boshqa joylardan ham so'ralishi mumkin va o'shanda ishora
     * adminning xabarisiz o'chib ketardi.
     */
    @PostMapping("/applications/seen")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markSeen(@AuthenticationPrincipal AuthenticatedUser admin) {
        badges.markSeen(admin.userId(), AdminBadgeService.SECTION_PARTNER_APPLICATIONS);
    }
}
