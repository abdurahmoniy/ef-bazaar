package uz.efbazaar.marketplace.partner.ads;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.UUID;

/**
 * Kanaldagi post havolasining bosilishi.
 *
 * <p>KIRMAGAN ODAM UCHUN HAM ochiq: anonim bosishni yozmasak,
 * konversiyaning boshini yo'qotamiz — hali ro'yxatdan o'tmagan odam
 * aynan kanal olib kelgan odam. Kirgan bo'lsa, e'lon unga o'sha kanal
 * bo'yicha biriktiriladi.
 */
@RestController
@RequestMapping("/api/v1/partners/click")
@RequiredArgsConstructor
public class PartnerClickController {

    private final ListingAttributionService service;

    @PostMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void click(@AuthenticationPrincipal AuthenticatedUser user,
                      @Valid @RequestBody ClickRequest request) {
        service.recordClick(request.linkCode(), request.listingId(),
                user == null ? null : user.userId());
    }

    public record ClickRequest(@NotBlank String linkCode, @NotNull UUID listingId) {}
}
