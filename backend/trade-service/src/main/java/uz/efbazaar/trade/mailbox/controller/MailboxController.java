package uz.efbazaar.trade.mailbox.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;
import uz.efbazaar.trade.mailbox.service.MailboxService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/mailboxes")
@RequiredArgsConstructor
public class MailboxController {

    private final MailboxService service;
    private final MailboxMapper mapper;

    @GetMapping
    public List<MailboxResponse> listOwnedBy(@RequestHeader("X-User-Id") UUID userId) {
        return service.listOwnedBy(userId).stream()
                .map(mapper::toResponse)
                .toList();
    }

    @GetMapping("/{id}")
    public MailboxResponse getOne(
            @RequestHeader("X-User-Id") UUID userId,
            @PathVariable UUID id) {
        return mapper.toResponse(service.getOwned(userId, id));
    }
}
