package uz.efbazaar.trade.mailbox.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.mailbox.service.MailboxPreservationService;
import uz.efbazaar.trade.security.AuthenticatedUser;
import java.util.UUID;

/** Explicit admin preservation is additive and audited. This API cannot clear a hold. */
@RestController
@RequestMapping("/api/v1/admin/mailboxes")
@RequiredArgsConstructor
public class MailboxPreservationController {
    private final MailboxPreservationService preservation;
    public record HoldRequest(@NotBlank @Size(max = 1000) String reason) {}
    @PostMapping("/{id}/preservation-hold")
    public MailboxPreservationService.Hold set(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id,
                                               @Valid @RequestBody HoldRequest request) {
        return preservation.setHold(me.userId(), id, request.reason());
    }
}
