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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import uz.efbazaar.trade.common.PageResponse;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mail.controller.MailController;
import uz.efbazaar.trade.mail.dto.InboxPage;
import uz.efbazaar.trade.mail.dto.MailboxSummary;
import uz.efbazaar.trade.mail.dto.MessageDetail;
import uz.efbazaar.trade.mail.service.MailService;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxSource;
import uz.efbazaar.trade.mailbox.dto.AdminMailboxResponse;
import uz.efbazaar.trade.mailbox.dto.CreateMailboxRequest;
import uz.efbazaar.trade.mailbox.dto.MailboxResponse;
import uz.efbazaar.trade.mailbox.dto.MailboxStats;
import uz.efbazaar.trade.mailbox.mapper.MailboxMapper;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.Map;

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
@lombok.extern.slf4j.Slf4j
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
    private final uz.efbazaar.trade.mail.service.MailboxPasswordResolver passwords;

    private final uz.efbazaar.trade.mailbox.config.MailboxDomains domains;

    /**
     * Clears out a mailbox nobody holds.
     *
     * <p>For the leftovers: an address reserved by a trade that never got off
     * the ground, or one created by hand and never handed out. Anything with an
     * owner or a live trade behind it is refused — that mailbox is somebody's
     * account, and if their Konami address still points at it, deleting it
     * takes the account with it for good.
     *
     * <p>Marked deleted here; the worker removes it from Mailcow.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        service.deleteUnheld(id);
        log.info("Admin {} deleted mailbox {}", me.userId(), id);
    }

    /**
     * Takes the mailbox away from its owner and rotates its password. Refused
     * while a trade in progress uses it.
     */
    @PostMapping("/{id}/detach")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void detach(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        service.detachOwner(me.userId(), id);
    }

    /** Hands the mailbox to another user and rotates its password. */
    @PostMapping("/{id}/reassign")
    public AdminMailboxResponse reassign(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @Valid @RequestBody uz.efbazaar.trade.mailbox.dto.ReassignMailboxRequest request) {
        return mapper.toAdminResponse(service.reassignOwner(me.userId(), id, request.ownerUserId()));
    }

    /**
     * The mailbox's current password, for handing to whoever ends up with it.
     *
     * <p>Its own endpoint rather than a field on the list, for the same reason
     * the card number is: it keeps the password out of every other response,
     * and makes each disclosure one line in the log rather than a side effect
     * of opening a page.
     *
     * <p>Reads the stored value rather than a remembered one, so it stays
     * right across the rotation that happens when a trade hands the mailbox
     * over — the password announced when the mailbox was created stops working
     * at that moment, and this is what replaces it.
     *
     * <p>The password itself is never logged. Only the fact of the disclosure.
     */
    @GetMapping("/{id}/password")
    public Map<String, String> revealPassword(@AuthenticationPrincipal AuthenticatedUser me,
                                              @PathVariable UUID id) {
        Mailbox mbox = service.getRaw(id);
        // A reserved row carries a dummy password until the worker answers, so
        // decrypting it fails with a stack trace that says nothing useful. The
        // honest answer is that the mailbox does not exist yet.
        if (mbox.getProvisionedAt() == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Pochta qutisi hali yaratilmagan — paroli ham yo'q");
        }
        String password = new String(passwords.decryptPassword(mbox), java.nio.charset.StandardCharsets.UTF_8);
        log.info("Admin {} revealed the password of mailbox {}", me.userId(), id);
        return Map.of("email", mbox.getEmail(), "password", password);
    }

    /**
     * Every mailbox, newest first. All filters optional: address substring,
     * owner, provenance, "not yet provisioned", "no owner".
     */
    @GetMapping
    public PageResponse<AdminMailboxResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UUID ownerUserId,
            @RequestParam(required = false) MailboxSource source,
            @RequestParam(defaultValue = "false") boolean pending,
            @RequestParam(defaultValue = "false") boolean unassigned,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        return PageResponse.of(
                service.searchForAdmin(search, ownerUserId, source, pending, unassigned, pageable),
                mapper::toAdminResponse);
    }

    /** Counters for the filter chips. */
    @GetMapping("/stats")
    public MailboxStats stats() {
        return service.statsForAdmin();
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
        String domain = request.domain() == null || request.domain().isBlank()
                ? domains.defaultDomain()
                : request.domain().trim().toLowerCase(java.util.Locale.ROOT);
        if (!domains.allowed(domain)) {
            throw new uz.efbazaar.trade.common.exception.ApiCodeException(
                    HttpStatus.BAD_REQUEST, "domain_not_allowed", "Bu domen ruxsat etilmagan");
        }
        String email = request.localPart() + "@" + domain;
        Mailbox created = service.createPendingForAdmin(email, request.ownerUserId(), admin.userId());
        events.mailboxProvisionRequest(created.getId(), request.localPart(), domain);
        return mapper.toAdminResponse(created);
    }

    /** Domains the create form may offer, default first. */
    @GetMapping("/domains")
    public java.util.List<String> domains() {
        return domains.all();
    }
}
