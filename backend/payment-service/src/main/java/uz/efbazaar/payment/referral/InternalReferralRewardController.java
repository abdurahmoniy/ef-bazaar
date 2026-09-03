package uz.efbazaar.payment.referral;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * marketplace-service mukofotni shu yerdan to'laydi.
 *
 * <p>Ichki: {@code InternalSecretFilter} {@code /internal/} prefiksidagi
 * har bir so'rovdan {@code X-Internal-Secret} talab qiladi, nginx esa uni
 * tashqaridan kelgan so'rovda tozalab tashlaydi. Aks holda istalgan odam
 * o'ziga mukofot yozdirib olardi.
 */
@RestController
@RequestMapping("/internal/referrals")
@RequiredArgsConstructor
public class InternalReferralRewardController {

    private final ReferralRewardService service;

    @PostMapping("/reward")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reward(@Valid @RequestBody RewardRequest request) {
        service.reward(request.referredUserId(), request.referrerUserId(), request.rewardTiyin());
    }

    public record RewardRequest(
            @NotNull UUID referredUserId,
            @NotNull UUID referrerUserId,
            @PositiveOrZero long rewardTiyin) {}
}
