package uz.efbazaar.marketplace.trust;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.trust.TrustDtos.ComplaintResponse;
import uz.efbazaar.marketplace.trust.TrustDtos.FileComplaintRequest;

import java.util.UUID;

/**
 * Server-to-server complaint intake. Guarded by
 * {@link uz.efbazaar.marketplace.security.InternalSecretFilter} —
 * caller must send {@code X-Internal-Secret}. Unlike {@link TrustController}
 * this reads the complainant from the payload (there is no user JWT on
 * inbound service calls); the caller is trusted to identify the aggrieved
 * party correctly (e.g. Chempionat-X passing the reviewer's UUID).
 */
@Slf4j
@RestController
@RequestMapping("/internal/marketplace/v1/trust")
@RequiredArgsConstructor
public class InternalTrustController {

    private final TrustService service;

    @PostMapping("/complaints")
    @ResponseStatus(HttpStatus.CREATED)
    public ComplaintResponse file(@Valid @RequestBody InternalComplaintRequest body) {
        log.info("Internal complaint intake: complainant={} accused={} category={} contextType={} contextId={}",
                body.complainantId(), body.request().accusedId(), body.request().category(),
                body.request().contextType(), body.request().contextId());
        return ComplaintResponse.from(service.fileComplaint(body.complainantId(), body.request()));
    }

    public record InternalComplaintRequest(
            @NotNull UUID complainantId,
            @NotNull @Valid FileComplaintRequest request
    ) {}
}
