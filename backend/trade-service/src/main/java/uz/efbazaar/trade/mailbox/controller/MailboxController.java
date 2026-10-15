package uz.efbazaar.trade.mailbox.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.dto.RenameMailboxRequest;
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

    @GetMapping
    public List<MailboxResponse> listOwnedBy(@AuthenticationPrincipal AuthenticatedUser me) {
        Set<UUID> locked = access.lockedIds(me.userId());
        return service.listOwnedBy(me.userId()).stream()
                .map(m -> mapper.toResponse(m).withLocked(locked.contains(m.getId())))
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
