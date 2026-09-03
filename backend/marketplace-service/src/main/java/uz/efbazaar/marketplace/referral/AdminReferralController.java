package uz.efbazaar.marketplace.referral;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.referral.ReferralDtos.InvitedUser;
import uz.efbazaar.marketplace.referral.ReferralDtos.ReferralSettingsResponse;
import uz.efbazaar.marketplace.referral.ReferralDtos.ReferrerRow;
import uz.efbazaar.marketplace.referral.ReferralDtos.UpdateReferralSettingsRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/** Adminka "Referallar" bo'limi — /api/v1/admin/** SecurityConfig'da ROLE_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/referrals")
@RequiredArgsConstructor
public class AdminReferralController {

    private final ReferralService service;

    /**
     * Reyting: kim eng ko'p odam olib kelayapti.
     *
     * <p>Bu savolga bo'lim sahifalari javob bera olmaydi — ular "kim
     * kimni taklif qilgan" ni ko'rsatadi. Reyting esa platformani
     * hozir kim o'stirayotganini ko'rsatadi.
     */
    @GetMapping
    public List<ReferrerRow> leaderboard(@PageableDefault(size = 50) Pageable pageable) {
        return service.leaderboard(pageable);
    }

    /** Bitta taklif qiluvchi kimlarni olib kelgan. */
    @GetMapping("/{userId}")
    public List<InvitedUser> invited(@PathVariable UUID userId) {
        return service.invitedBy(userId);
    }

    @GetMapping("/settings")
    public ReferralSettingsResponse settings() {
        return ReferralSettingsResponse.from(service.settings());
    }

    @PutMapping("/settings")
    public ReferralSettingsResponse updateSettings(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @Valid @RequestBody UpdateReferralSettingsRequest request) {
        return ReferralSettingsResponse.from(
                service.updateSettings(request.rewardSom(), admin.userId()));
    }
}
