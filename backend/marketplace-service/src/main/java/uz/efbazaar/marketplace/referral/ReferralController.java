package uz.efbazaar.marketplace.referral;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.referral.ReferralDtos.ClaimRequest;
import uz.efbazaar.marketplace.referral.ReferralDtos.ClaimResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

/** Foydalanuvchi tomoni — taklif havolasi. */
@RestController
@RequestMapping("/api/v1/referrals")
@RequiredArgsConstructor
public class ReferralController {

    private final ReferralService service;

    /**
     * Ro'yxatdan o'tgandan keyin brauzer saqlab qo'ygan kodni yuboradi.
     *
     * <p>Rad etish 200 va {@code claimed: false} bilan qaytadi, 4xx bilan
     * emas: kod eskirgan yoki foydalanuvchi allaqachon taklif qilingan
     * bo'lishi mutlaqo normal va ekranda xato ko'rsatadigan hodisa emas.
     */
    @PostMapping("/claim")
    public ClaimResponse claim(@AuthenticationPrincipal AuthenticatedUser user,
                               @Valid @RequestBody ClaimRequest request) {
        return new ClaimResponse(service.claim(user.userId(), request.code()));
    }
}
