package uz.efbazaar.trade.mailbox.custom;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.trade.mailbox.custom.dto.AvailabilityResponse;
import uz.efbazaar.trade.mailbox.custom.dto.ClaimCustomMailboxRequest;
import uz.efbazaar.trade.mailbox.custom.dto.CustomMailboxResponse;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Self-named mailboxes the user picks and owns. */
@RestController
@RequestMapping("/api/v1/mailboxes/custom")
@RequiredArgsConstructor
public class CustomMailboxController {

    private final CustomMailboxService service;
    private final MailboxAccessService access;
    private final uz.efbazaar.trade.mailbox.link.MailboxLinkSessionRepository sessions;

    @GetMapping("/availability")
    public AvailabilityResponse availability(@AuthenticationPrincipal AuthenticatedUser me,
                                             @RequestParam String localPart,
                                             @RequestParam(required = false) String domain) {
        return service.availability(me.userId(), localPart, domain);
    }

    /** 202: the address is reserved now, the Mailcow box follows from the worker. */
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public CustomMailboxResponse claim(@AuthenticationPrincipal AuthenticatedUser me,
                                       @Valid @RequestBody ClaimCustomMailboxRequest request) {
        return toResponse(service.claim(me.userId(), request.localPart(), request.domain()), Set.of(), java.util.Map.of());
    }

    @GetMapping
    public List<CustomMailboxResponse> list(@AuthenticationPrincipal AuthenticatedUser me) {
        Set<UUID> locked = access.lockedIds(me.userId());
        List<Mailbox> boxes = service.listOwned(me.userId());
        java.util.Map<UUID, UUID> live = new java.util.HashMap<>();
        if (!boxes.isEmpty()) {
            sessions.findLiveByMailboxIds(boxes.stream().map(Mailbox::getId).toList())
                    .forEach(s -> live.put(s.getMailboxId(), s.getId()));
        }
        return boxes.stream().map(m -> toResponse(m, locked, live)).toList();
    }

    private static CustomMailboxResponse toResponse(Mailbox m, Set<UUID> locked, java.util.Map<UUID, UUID> live) {
        return new CustomMailboxResponse(m.getId(), m.getEmail(), m.getProvisionedAt() != null,
                locked.contains(m.getId()), m.getLinkedAccountId(), live.get(m.getId()), m.getCreatedAt());
    }
}
