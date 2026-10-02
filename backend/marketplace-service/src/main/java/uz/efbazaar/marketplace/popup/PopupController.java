package uz.efbazaar.marketplace.popup;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.popup.PopupDtos.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/popups")
@RequiredArgsConstructor
public class PopupController {
    private final PopupService service;

    @GetMapping("/next")
    public ResponseEntity<PublicCampaign> next(@AuthenticationPrincipal AuthenticatedUser user,
                                               @RequestParam(required = false) Trigger trigger) {
        if (trigger == null) return ResponseEntity.badRequest().build();
        return service.next(user.userId(), trigger).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/{id}/claim")
    public ResponseEntity<Delivery> claim(@AuthenticationPrincipal AuthenticatedUser user,
                                           @PathVariable UUID id, @Valid @RequestBody Claim input) {
        return service.claim(id, user.userId(), input).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/deliveries/{id}/events")
    public ResponseEntity<Void> event(@AuthenticationPrincipal AuthenticatedUser user,
                                       @PathVariable UUID id, @Valid @RequestBody RecordEvent input) {
        service.recordEvent(id, user.userId(), input.event());
        return ResponseEntity.noContent().build();
    }
}
