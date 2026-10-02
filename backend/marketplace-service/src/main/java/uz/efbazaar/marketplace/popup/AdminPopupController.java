package uz.efbazaar.marketplace.popup;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.popup.PopupDtos.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/** The existing /api/v1/admin/** security rule requires ROLE_ADMIN on every operation. */
@RestController
@RequestMapping("/api/v1/admin/popups")
@RequiredArgsConstructor
public class AdminPopupController {
    private final PopupService service;

    @GetMapping
    public List<Campaign> list() { return service.list(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Campaign create(@AuthenticationPrincipal AuthenticatedUser admin, @Valid @RequestBody CreateCampaign input) {
        return service.create(admin.userId(), input);
    }

    @PatchMapping("/{id}/status")
    public Campaign updateStatus(@PathVariable UUID id, @Valid @RequestBody UpdateStatus input) {
        return service.updateStatus(id, input.status());
    }
}
