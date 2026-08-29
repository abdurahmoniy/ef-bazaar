package uz.efbazaar.payment.observation.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.observation.dto.IgnoreObservationRequest;
import uz.efbazaar.payment.observation.dto.ObservationResponse;
import uz.efbazaar.payment.observation.dto.ResolveObservationRequest;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/payments/observations")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminObservationController {

    private final ByCardService byCard;

    @GetMapping("/unmatched")
    public List<ObservationResponse> unmatched() {
        return byCard.unmatched().stream().map(ObservationResponse::of).toList();
    }

    /**
     * Qo'lda hal qilingan tushumlar tarixi.
     *
     * <p>Kim, kimga, qachon va nima uchun — amal qaytarib bo'lmagani uchun
     * bu savollar keyinroq albatta so'raladi.
     */
    @GetMapping("/resolved")
    public List<ObservationResponse> resolved() {
        return byCard.resolvedHistory().stream().map(ObservationResponse::of).toList();
    }

    @PostMapping("/{id}/resolve")
    public ObservationResponse resolve(@AuthenticationPrincipal AuthenticatedUser me,
                                       @PathVariable UUID id,
                                       @Valid @RequestBody ResolveObservationRequest req) {
        return ObservationResponse.of(
                byCard.resolveManually(id, req.userId(), me.userId(), req.note()));
    }

    @PostMapping("/{id}/ignore")
    public ObservationResponse ignore(@AuthenticationPrincipal AuthenticatedUser me,
                                      @PathVariable UUID id,
                                      @Valid @RequestBody(required = false)
                                      IgnoreObservationRequest req) {
        return ObservationResponse.of(
                byCard.markIgnored(id, me.userId(), req == null ? null : req.note()));
    }
}
