package uz.efbazaar.trade.mailbox.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.common.PageResponse;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mail.controller.MailController;
import uz.efbazaar.trade.mail.dto.InboxPage;
import uz.efbazaar.trade.mail.dto.MailboxSummary;
import uz.efbazaar.trade.mail.dto.MessageDetail;
import uz.efbazaar.trade.mail.service.MailService;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.dto.AdminMailboxResponse;
import uz.efbazaar.trade.mailbox.dto.CreateMailboxRequest;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/**
 * Admin dashboard endpoints. TOTP MFA is a follow-up (spec §11) — role gate is
 * the only enforcement in MVP.
 *
 * <p>The mail-reading endpoints here deliberately bypass mailbox ownership: an
 * admin auditing an escrow mailbox is the whole point. They stay strictly
 * read-only — there is no admin {@code markRead}, so opening a message from the
 * panel never changes what the mailbox owner sees as unread.
 */
@RestController
@RequestMapping("/api/v1/admin/mailboxes")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminMailboxController {

    private final MailboxRepository repo;
    private final MailboxService service;
    private final MailboxMapper mapper;
    private final MailService mail;
    private final TradeEventPublisher events;

    @Value("${trade.mailbox.domain:efbazaar.uz}")
    private String mailboxDomain;

    /** Every mailbox, newest first. Optional filters: address substring, owner. */
    @GetMapping
    public PageResponse<AdminMailboxResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UUID ownerUserId,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return PageResponse.of(service.searchForAdmin(search, ownerUserId, pageable),
                mapper::toAdminResponse);
    }

    @GetMapping("/orphaned")
    public List<MailboxResponse> listOrphaned() {
        return repo.findOrphaned().stream().map(mapper::toResponse).toList();
    }

    @GetMapping("/{id}")
    public AdminMailboxResponse getOne(@PathVariable UUID id) {
        return mapper.toAdminResponse(service.getRaw(id));
    }

    /**
     * Live IMAP counters for one mailbox (unread + last activity). Split from
     * {@link #getOne} because it costs an IMAP round trip and the detail header
     * has to render even when Mailcow is unreachable.
     */
    @GetMapping("/{id}/summary")
    public MailboxSummary summary(@PathVariable UUID id) {
        return mail.summarize(List.of(service.getRaw(id))).getFirst();
    }

    /**
     * A mailbox that Mailcow hasn't confirmed yet has no credentials to log in
     * with, so IMAP would throw. Answer with an empty page instead — "pending"
     * is a normal state right after registration, not a server error.
     */
    @GetMapping("/{id}/inbox")
    public InboxPage inbox(@PathVariable UUID id,
                           @RequestParam(defaultValue = "50") int limit,
                           @RequestParam(defaultValue = "0") int offset) {
        Mailbox mailbox = service.getRaw(id);
        if (mailbox.getProvisionedAt() == null) {
            return new InboxPage(List.of(), 0, limit, offset);
        }
        return mail.listInbox(mailbox, limit, offset);
    }

    @GetMapping("/{id}/messages/{messageId}")
    public MessageDetail message(@PathVariable UUID id, @PathVariable String messageId) {
        return mail.getMessage(service.getRaw(id), messageId);
    }

    @GetMapping("/{id}/messages/{messageId}/attachments/{attachmentId}")
    public ResponseEntity<Resource> attachment(@PathVariable UUID id,
                                               @PathVariable String messageId,
                                               @PathVariable String attachmentId) {
        return MailController.download(
                mail.getAttachment(service.getRaw(id), messageId, attachmentId));
    }

    /**
     * Registers a mailbox outside the trade flow and links it to a user.
     *
     * <p>202, not 201: the row exists immediately (address reserved, visible in
     * the list as "pending"), but the Mailcow box is created by
     * smart-admin-worker. The row flips to provisioned when
     * {@code efbazaar.trade.mailbox-provisioned} comes back.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public AdminMailboxResponse create(@AuthenticationPrincipal AuthenticatedUser admin,
                                       @Valid @RequestBody CreateMailboxRequest request) {
        String email = request.localPart() + "@" + mailboxDomain;
        Mailbox created = service.createPendingForAdmin(email, request.ownerUserId(), admin.userId());
        events.mailboxProvisionRequest(created.getId(), request.localPart());
        return mapper.toAdminResponse(created);
    }
}
