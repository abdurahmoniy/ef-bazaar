package uz.efbazaar.payment.health.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.health.UserbotHealth;
import uz.efbazaar.payment.health.dto.UserbotStatusResponse;

@RestController
@RequestMapping("/api/v1/admin/payments/userbot")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminUserbotStatusController {

    private final UserbotHealth health;

    @GetMapping
    public UserbotStatusResponse status() {
        return new UserbotStatusResponse(
                health.isHealthy(),
                health.lastSeenAt().orElse(null),
                health.timeoutSeconds());
    }
}
