package uz.efbazaar.trade.mailbox.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.dto.RenameMailboxRequest;
import uz.efbazaar.trade.mailbox.dto.UnlockMailboxRequest;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import uz.efbazaar.trade.plan.service.MailboxSlotService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/mailboxes")
@RequiredArgsConstructor
public class MailboxController {

    private final MailboxService service;
    private final MailboxMapper mapper;
    private final MailboxSlotService slotService;
    private final MailboxAccessService access;
    private final uz.efbazaar.trade.mailbox.link.MailboxLinkSessionRepository sessions;

    @GetMapping
    public List<MailboxResponse> listOwnedBy(@AuthenticationPrincipal AuthenticatedUser me) {
        Set<UUID> locked = access.lockedIds(me.userId());
        List<uz.efbazaar.trade.mailbox.domain.Mailbox> owned = service.listOwnedBy(me.userId());
        // Which boxes are being linked right now — the free-box list hides them.
        java.util.Map<UUID, UUID> live = new java.util.HashMap<>();
        if (!owned.isEmpty()) {
            sessions.findLiveByMailboxIds(owned.stream().map(uz.efbazaar.trade.mailbox.domain.Mailbox::getId).toList())
                    .forEach(s -> live.put(s.getMailboxId(), s.getId()));
        }
        return owned.stream()
                .map(m -> mapper.toResponse(m).withLocked(locked.contains(m.getId()))
                        .withActiveSession(live.get(m.getId())))
                .toList();
    }

    /**
     * Slot holati — profildagi ogohlantirish shu yerdan o'qiydi.
     *
     * <p>Alohida endpoint, ro'yxatning ichida emas: ogohlantirish har
     * sahifada ko'rinadi va qutilar ro'yxatini butunlay yuklab
     * o'tirishning hojati yo'q.
     */
    @GetMapping("/slots")
    public MailboxSlotService.SlotStatus slots(@AuthenticationPrincipal AuthenticatedUser me) {
        return slotService.statusFor(me.userId());
    }

    @GetMapping("/{id}")
    public MailboxResponse getOne(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID id) {
        return mapper.toResponse(service.getOwned(me.userId(), id))
                .withLocked(access.isLocked(me.userId(), id));
    }

    /** Opens a locked mailbox by locking one of the open ones in its place. */
    @PostMapping("/{id}/unlock")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlock(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id,
                       @Valid @RequestBody UnlockMailboxRequest request) {
        service.swapAccess(me.userId(), id, request.lockInsteadId());
    }

    @PatchMapping("/{id}/name")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void rename(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id,
                       @Valid @RequestBody RenameMailboxRequest request) {
        service.renameOwnedBy(me.userId(), id, request.displayName());
    }

    @PostMapping("/{id}/detach")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void detach(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        service.detachOwnedBy(me.userId(), id);
    }

}
