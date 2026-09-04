package uz.efbazaar.trade.mailbox.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.service.MailboxSlotService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/mailboxes")
@RequiredArgsConstructor
public class MailboxController {

    private final MailboxService service;
    private final MailboxMapper mapper;
    private final MailboxSlotService slotService;

    @GetMapping
    public List<MailboxResponse> listOwnedBy(@AuthenticationPrincipal AuthenticatedUser me) {
        return service.listOwnedBy(me.userId()).stream()
                .map(mapper::toResponse)
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
        return mapper.toResponse(service.getOwned(me.userId(), id));
    }

    /**
     * O'z pochta qutisini o'chirish — slotni bo'shatish uchun yagona yo'l.
     *
     * <p>QAYTARIB BO'LMAYDI: quti pochta serveridan ham o'chiriladi va
     * undagi Konami xatlari yo'qoladi. Ogohlantirish frontendda.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        service.deleteOwnedBy(me.userId(), id);
    }
}
