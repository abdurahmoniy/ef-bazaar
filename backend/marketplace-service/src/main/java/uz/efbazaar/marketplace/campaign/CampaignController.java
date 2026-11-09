package uz.efbazaar.marketplace.campaign;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.campaign.CampaignDtos.ClaimResponse;
import uz.efbazaar.marketplace.campaign.CampaignDtos.CodeRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

/** Foydalanuvchi tomoni — kampaniya havolasi ({@code ?c=<kod>}). */
@RestController
@RequestMapping("/api/v1/campaigns")
@RequiredArgsConstructor
public class CampaignController {

    private final CampaignService service;

    /**
     * Bosilish. KIRMAGAN ODAM UCHUN HAM ochiq (SecurityConfig'da permitAll):
     * anonim bosishni yozmasak voronkaning boshi yo'qoladi.
     */
    @PostMapping("/click")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void click(@AuthenticationPrincipal AuthenticatedUser user,
                      @Valid @RequestBody CodeRequest request) {
        service.recordWebClick(request.code(), user == null ? null : user.userId());
    }

    /**
     * Ro'yxatdan o'tgandan keyin brauzer saqlab qo'ygan kodni yuboradi. Rad
     * etish 200 va {@code claimed: false} — eski akkount yoki takroriy da'vo
     * normal hodisa, ekranda xato emas.
     */
    @PostMapping("/claim")
    public ClaimResponse claim(@AuthenticationPrincipal AuthenticatedUser user,
                               @Valid @RequestBody CodeRequest request) {
        return new ClaimResponse(service.claim(user.userId(), request.code()));
    }
}
