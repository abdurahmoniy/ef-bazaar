package uz.efbazaar.payment.partner;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * marketplace-service hamkorlik to'lovini shu yerdan yechadi.
 *
 * <p>Ichki: nginx {@code /internal/} prefiksini tashqaridan bloklaydi.
 * Aks holda istalgan odam birovning hamyonidan pul yechishni so'ray olardi.
 */
@RestController
@RequestMapping("/internal/partners")
@RequiredArgsConstructor
public class InternalPartnerFeeController {

    private final PartnerFeeService fees;

    @PostMapping("/charge")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void charge(@RequestBody ChargeRequest request) {
        fees.charge(request.applicationId(), request.userId(), request.feeTiyin());
    }

    public record ChargeRequest(
            @NotNull UUID applicationId,
            @NotNull UUID userId,
            @Positive long feeTiyin) {}
}
