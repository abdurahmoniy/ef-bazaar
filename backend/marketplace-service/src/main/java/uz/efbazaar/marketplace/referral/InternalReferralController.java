package uz.efbazaar.marketplace.referral;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Bot chaqiradi: {@code /start ref_<kod>} yuki.
 *
 * <p>{@code X-Internal-Secret} bilan himoyalangan va nginx
 * {@code /internal/} yo'lini tashqi tarmoqdan to'sadi — hamkorlik
 * endpointi bilan bir xil.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/referrals")
@RequiredArgsConstructor
public class InternalReferralController {

    private final ReferralService service;

    @PostMapping("/pending")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void pending(@Valid @RequestBody PendingRequest request) {
        service.remember(request.telegramId(), request.code());
    }

    public record PendingRequest(@NotNull Long telegramId, @NotBlank String code) {}
}
