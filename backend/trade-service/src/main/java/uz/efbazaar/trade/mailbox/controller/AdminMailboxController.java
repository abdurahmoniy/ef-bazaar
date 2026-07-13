package uz.efbazaar.trade.mailbox.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;

import java.util.List;

/**
 * Admin dashboard endpoints. TOTP MFA is a follow-up (spec §11) — role gate is
 * the only enforcement in MVP.
 */
@RestController
@RequestMapping("/api/v1/admin/mailboxes")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminMailboxController {

    private final MailboxRepository repo;
    private final MailboxMapper mapper;

    @GetMapping("/orphaned")
    public List<MailboxResponse> listOrphaned() {
        return repo.findOrphaned().stream().map(mapper::toResponse).toList();
    }
}
