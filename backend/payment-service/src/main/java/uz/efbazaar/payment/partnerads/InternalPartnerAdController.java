package uz.efbazaar.payment.partnerads;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * marketplace-service moves channel advertising money through here.
 *
 * <p>Internal: {@code InternalSecretFilter} rejects everything under
 * {@code /internal/} without the shared secret, by path prefix, so this
 * controller needs no wiring of its own. Otherwise anyone could pay themselves
 * out of a seller's hold.
 */
@RestController
@RequestMapping("/internal/partner-ads")
@RequiredArgsConstructor
public class InternalPartnerAdController {

    private final PartnerAdLedgerService ads;

    @PostMapping("/hold")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void hold(@Valid @RequestBody HoldRequest request) {
        ads.hold(request.orderId(), request.sellerId(), request.totalTiyin());
    }

    @PostMapping("/settle")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void settle(@Valid @RequestBody SettleRequest request) {
        ads.settle(request.postId(), request.sellerId(), request.partnerUserId(), request.priceTiyin());
    }

    @PostMapping("/refund")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void refund(@Valid @RequestBody RefundRequest request) {
        ads.refund(request.postId(), request.sellerId(), request.priceTiyin());
    }

    @PostMapping("/monthly")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void monthly(@Valid @RequestBody MonthlyRequest request) {
        ads.monthly(request.channelId(), request.partnerUserId(),
                request.amountTiyin(), request.period());
    }

    /**
     * Amounts are {@code @PositiveOrZero}, not {@code @Positive}: a free channel
     * is a real configuration, and the service already declines to write a zero
     * posting. Rejecting it here would fail the order instead.
     */
    public record HoldRequest(@NotNull UUID orderId, @NotNull UUID sellerId,
                              @NotNull @PositiveOrZero Long totalTiyin) {}

    public record SettleRequest(@NotNull UUID postId, @NotNull UUID sellerId,
                                @NotNull UUID partnerUserId,
                                @NotNull @PositiveOrZero Long priceTiyin) {}

    public record RefundRequest(@NotNull UUID postId, @NotNull UUID sellerId,
                                @NotNull @PositiveOrZero Long priceTiyin) {}

    public record MonthlyRequest(@NotNull UUID channelId, @NotNull UUID partnerUserId,
                                 @NotNull @PositiveOrZero Long amountTiyin,
                                 @NotBlank String period) {}

    /**
     * What a partner has been paid, by stream.
     *
     * <p>marketplace shows these in the partner panel. It does not keep
     * its own copy: two records of one payment drift apart and neither
     * can be trusted afterwards.
     */
    @GetMapping("/earnings")
    public PartnerAdLedgerService.PartnerEarnings earnings(@RequestParam UUID partnerUserId) {
        return ads.earningsOf(partnerUserId);
    }
}
