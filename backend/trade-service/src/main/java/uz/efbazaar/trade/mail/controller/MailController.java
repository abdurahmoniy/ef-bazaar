package uz.efbazaar.trade.mail.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.trade.mail.dto.InboxPage;
import uz.efbazaar.trade.mail.dto.MailboxSummary;
import uz.efbazaar.trade.mail.dto.MessageDetail;
import uz.efbazaar.trade.mail.service.MailRateLimiter;
import uz.efbazaar.trade.mail.service.MailService;
import uz.efbazaar.trade.mail.service.RateLimitExceededException;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** Owner mail reads, explicit ZIP portability, and bounded confirmed cleanup. */
@RestController
@RequestMapping("/api/v1/mail")
@RequiredArgsConstructor
public class MailController {

    private final MailService mail;
    private final MailRateLimiter rateLimiter;

    @GetMapping("/mailboxes")
    public List<MailboxSummary> mailboxes(@AuthenticationPrincipal AuthenticatedUser me) {
        enforceRateLimit(me.userId());
        return mail.listMyMailboxes(me.userId());
    }

    @GetMapping("/{mailboxId}/inbox")
    public InboxPage inbox(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID mailboxId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        enforceRateLimit(me.userId());
        return mail.listInbox(me.userId(), mailboxId, limit, offset);
    }

    @GetMapping("/{mailboxId}/messages/{messageId}")
    public MessageDetail message(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID mailboxId,
            @PathVariable String messageId) {
        enforceRateLimit(me.userId());
        return mail.getMessage(me.userId(), mailboxId, messageId);
    }

    @PostMapping("/{mailboxId}/messages/{messageId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID mailboxId,
            @PathVariable String messageId) {
        enforceRateLimit(me.userId());
        mail.markSeen(me.userId(), mailboxId, messageId);
    }

    @GetMapping("/{mailboxId}/messages/{messageId}/attachments/{attachmentId}")
    public ResponseEntity<Resource> attachment(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID mailboxId,
            @PathVariable String messageId,
            @PathVariable String attachmentId) {
        enforceRateLimit(me.userId());
        var payload = mail.getAttachment(me.userId(), mailboxId, messageId, attachmentId);
        return download(payload);
    }

    @GetMapping("/{mailboxId}/export")
    public ResponseEntity<Resource> export(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID mailboxId,
                                          @RequestParam(defaultValue = "100") int limit,
                                          @RequestParam(required = false) String beforeUid) {
        enforceRateLimit(me.userId());
        var archive = mail.exportArchive(me.userId(), mailboxId, limit, beforeUid);
        var response = ResponseEntity.ok().contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"mailbox-" + mailboxId + ".zip\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-store");
        if (archive.nextBeforeUid() != null) response.header("X-Next-Before-Uid", archive.nextBeforeUid());
        return response.body(new ByteArrayResource(archive.bytes()));
    }

    public record CleanupRequest(List<String> messageIds, boolean confirmDelete) {}

    @PostMapping("/{mailboxId}/cleanup")
    public MailService.CleanupResult cleanup(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID mailboxId,
                                            @org.springframework.web.bind.annotation.RequestBody CleanupRequest request) {
        enforceRateLimit(me.userId());
        return mail.cleanup(me.userId(), mailboxId, request.messageIds(), request.confirmDelete());
    }

    /**
     * Shared response builder so the admin panel's attachment endpoint serves
     * bytes with exactly the same headers (always {@code attachment}, never
     * inline) as the user-facing one.
     */
    public static ResponseEntity<Resource> download(MailService.AttachmentPayload payload) {
        String filename = payload.filename() != null && !payload.filename().isBlank()
                ? payload.filename()
                : "attachment";
        // Always attachment (never inline) — the MVP never renders untrusted
        // binaries in the browser, even for image/pdf types. Preview support
        // is explicitly out of scope.
        ContentDisposition cd = ContentDisposition.attachment()
                .filename(filename, StandardCharsets.UTF_8)
                .build();

        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(cd);
        headers.setContentLength(payload.bytes().length);
        MediaType ct;
        try {
            ct = MediaType.parseMediaType(payload.contentType());
        } catch (Exception ex) {
            ct = MediaType.APPLICATION_OCTET_STREAM;
        }
        headers.setContentType(ct);

        Resource body = new ByteArrayResource(payload.bytes());
        return new ResponseEntity<>(body, headers, 200);
    }

    private void enforceRateLimit(UUID userId) {
        if (!rateLimiter.tryAcquire(userId)) {
            throw new RateLimitExceededException("Mail request rate limit exceeded");
        }
    }
}
