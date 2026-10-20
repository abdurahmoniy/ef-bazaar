package uz.efbazaar.trade.mail.service;

import jakarta.mail.Address;
import jakarta.mail.Flags;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Store;
import jakarta.mail.search.ComparisonTerm;
import jakarta.mail.search.ReceivedDateTerm;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeUtility;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import uz.efbazaar.trade.mail.dto.AttachmentMeta;
import uz.efbazaar.trade.mail.dto.InboxMessage;
import uz.efbazaar.trade.mail.dto.InboxPage;
import uz.efbazaar.trade.mail.dto.MailboxSummary;
import uz.efbazaar.trade.mail.dto.MessageDetail;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.service.MailboxAccessService;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.eclipse.angus.mail.imap.IMAPFolder;

/**
 * IMAP fetcher backing the {@code /api/v1/mail/**} endpoints. Every public
 * method verifies mailbox ownership before touching IMAP — a stranger's
 * user id must never see a 200 response for another buyer's mailbox.
 *
 * <p>Read/export paths use READ_ONLY. Mark-read touches one Seen flag; explicit
 * cleanup validates a bounded UID selection and uses UID EXPUNGE. Folder operations
 * always close under an exclusive pool lease, without general expunge.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailService {

    private final MailboxService mailboxes;
    private final ImapConnectionPool pool;
    private final HtmlSanitizer sanitizer;
    private final MailboxAccessService access;
    private final uz.efbazaar.trade.mailbox.service.MailboxPreservationService preservation;

    private static final int SNIPPET_LENGTH = 200;
    /** Cap on per-request page size so a malicious limit=1000000 can't OOM us. */
    private static final int MAX_PAGE_SIZE = 100;

    // ---------- sidebar / mailbox switcher ----------

    public List<MailboxSummary> listMyMailboxes(UUID userId) {
        return summarize(mailboxes.listOwnedBy(userId), true, access.lockedIds(userId));
    }

    /**
     * Same sidebar shape for an arbitrary set of mailboxes — used by the admin
     * panel, which resolves the rows itself instead of going through the
     * ownership filter.
     */
    public List<MailboxSummary> summarize(List<Mailbox> owned) {
        return summarize(owned, false, java.util.Set.of());
    }

    private record Counts(Integer unread, Instant lastActivity) {}
    private record SummaryCache(UUID owner, Instant visibleFrom, int passwordSignature, long fetchedAt, Counts counts) {}
    private final java.util.concurrent.ConcurrentHashMap<UUID, SummaryCache> summaryCache = new java.util.concurrent.ConcurrentHashMap<>();

    private List<MailboxSummary> summarize(List<Mailbox> owned, boolean ownerView, java.util.Set<UUID> lockedIds) {
        List<MailboxSummary> out = new ArrayList<>(owned.size());
        var modes = ownerView && !owned.isEmpty() ? access.metadataFor(owned.getFirst().getOwnerUserId())
                : java.util.Map.<UUID, MailboxAccessService.Access>of();
        for (Mailbox mb : owned) {
            var mode = modes.getOrDefault(mb.getId(), new MailboxAccessService.Access(MailboxAccessService.AccessState.ACTIVE, null, null, false));
            boolean locked = ownerView && lockedIds.contains(mb.getId());
            Counts counts = null;
            if (!locked) {
                if (ownerView) {
                    // compute coalesces concurrent sidebar polls for the same owner/mailbox.
                    var cached = summaryCache.compute(mb.getId(), (id, prior) -> {
                        long now = System.nanoTime();
                        int signature = java.util.Objects.hash(java.util.Arrays.hashCode(mb.getEncryptedPassword()),
                                java.util.Arrays.hashCode(mb.getPasswordIv()), java.util.Arrays.hashCode(mb.getPasswordTag()));
                        Instant cutoff = ownerVisibleFrom(mb);
                        if (prior != null && java.util.Objects.equals(prior.owner(), mb.getOwnerUserId())
                                && prior.visibleFrom().equals(cutoff) && prior.passwordSignature() == signature
                                && now - prior.fetchedAt() < java.time.Duration.ofSeconds(10).toNanos()) return prior;
                        Counts fresh = readCounts(mb, true);
                        return fresh == null ? null : new SummaryCache(mb.getOwnerUserId(), cutoff, signature, now, fresh);
                    });
                    if (cached != null) counts = cached.counts();
                    if (summaryCache.size() > 512) summaryCache.keySet().stream().filter(id -> !id.equals(mb.getId()))
                            .findFirst().ifPresent(summaryCache::remove);
                } else counts = readCounts(mb, false);
            }
            out.add(new MailboxSummary(mb.getId(), mb.getEmail(), mb.getDisplayName(),
                    counts == null ? null : counts.unread(), counts == null ? null : counts.lastActivity(),
                    mb.getHandedOffAt() != null ? mb.getHandedOffAt() : mb.getCreatedAt(), locked,
                    ownerView ? (locked ? MailboxAccessService.AccessState.RECOVERY : mode.accessState()) : MailboxAccessService.AccessState.ACTIVE,
                    ownerView ? mode.paidExpiresAt() : null, ownerView ? mode.graceEndsAt() : null,
                    ownerView && mode.selectedForFree()));
        }
        return out;
    }

    private Counts readCounts(Mailbox mb, boolean ownerView) {
        try (var lease = pool.lease(mb)) {
            Folder inbox = lease.store().getFolder("INBOX"); inbox.open(Folder.READ_ONLY);
            try {
                int unread; Instant activity = null;
                if (ownerView) {
                    unread = 0;
                    for (Message message : visibleMessages(inbox, ownerVisibleFrom(mb), false)) {
                        if (!message.isSet(Flags.Flag.SEEN)) unread++;
                        Instant received = message.getReceivedDate().toInstant();
                        if (activity == null || received.isAfter(activity)) activity = received;
                    }
                } else {
                    unread = inbox.getUnreadMessageCount();
                    if (inbox.getMessageCount() > 0) activity = safeReceivedAt((MimeMessage) inbox.getMessage(inbox.getMessageCount()));
                }
                return new Counts(unread, activity);
            } finally { silentClose(inbox); }
        } catch (Exception ex) {
            log.warn("Sidebar summary failed for mailbox {}: {}", mb.getId(), ex.toString());
            pool.invalidate(mb.getId()); return null;
        }
    }

    // ---------- inbox listing ----------

    public InboxPage listInbox(UUID userId, UUID mailboxId, int limit, int offset) {
        Mailbox mb = mailboxes.getReadable(userId, mailboxId);
        return listInbox(mb, limit, offset, ownerVisibleFrom(mb), access.isLocked(userId, mailboxId));
    }

    /**
     * Ownership-free variant. Only call it from a caller that has already
     * decided the requester may see this mailbox — today that is the
     * {@code ROLE_ADMIN}-gated admin panel.
     */
    public InboxPage listInbox(Mailbox mb, int limit, int offset) {
        return listInbox(mb, limit, offset, null, false);
    }

    private InboxPage listInbox(Mailbox mb, int limit, int offset, Instant visibleFrom, boolean recovery) {
        int cappedLimit = Math.max(1, Math.min(MAX_PAGE_SIZE, limit));
        int cappedOffset = Math.max(0, offset);

        UUID mailboxId = mb.getId();
        try (var lease = pool.lease(mb)) {
            Store store = lease.store();
            Folder inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            try {
                Message[] visible = visibleFrom == null ? null : visibleMessages(inbox, visibleFrom, recovery);
                int total = visible == null ? inbox.getMessageCount() : visible.length;
                if (total == 0 || cappedOffset >= total) {
                    return new InboxPage(List.of(), total, cappedLimit, cappedOffset);
                }
                // Filter BEFORE pagination: hidden messages must not leak through totals or gaps.
                int endMsgNum = total - cappedOffset;
                int startMsgNum = Math.max(1, endMsgNum - cappedLimit + 1);
                Message[] slice = visible == null
                        ? inbox.getMessages(startMsgNum, endMsgNum)
                        : Arrays.copyOfRange(visible, startMsgNum - 1, endMsgNum);

                // Prefetch envelope + flags + UID in one round trip.
                jakarta.mail.FetchProfile fp = new jakarta.mail.FetchProfile();
                fp.add(jakarta.mail.FetchProfile.Item.ENVELOPE);
                fp.add(jakarta.mail.FetchProfile.Item.FLAGS);
                fp.add(jakarta.mail.FetchProfile.Item.CONTENT_INFO);
                fp.add(IMAPFolder.FetchProfileItem.HEADERS);
                inbox.fetch(slice, fp);

                List<InboxMessage> rows = new ArrayList<>(slice.length);
                // Newest first: iterate reverse
                for (int i = slice.length - 1; i >= 0; i--) {
                    rows.add(toInboxRow((IMAPFolder) inbox, (MimeMessage) slice[i]));
                }
                return new InboxPage(rows, total, cappedLimit, cappedOffset);
            } finally {
                silentClose(inbox);
            }
        } catch (MessagingException e) {
            pool.invalidate(mb.getId());
            throw new IllegalStateException("IMAP listInbox failed for mailbox " + mailboxId, e);
        }
    }

    private InboxMessage toInboxRow(IMAPFolder folder, MimeMessage msg) throws MessagingException {
        long uid;
        try { uid = folder.getUID(msg); } catch (MessagingException e) { uid = -1; }
        Address[] from = msg.getFrom();
        InternetAddress fromAddr = firstInternetAddress(from);
        String subject = safeDecode(msg.getSubject());
        Instant received = safeReceivedAt(msg);
        boolean seen = msg.isSet(Flags.Flag.SEEN);
        boolean hasAttachments = false;
        String snippet = "";
        try {
            SnippetAndAttachments s = extractSnippetAndAttachmentFlag(msg);
            hasAttachments = s.hasAttachments;
            snippet = s.snippet;
        } catch (Exception ex) {
            log.debug("snippet extract failed for uid {}: {}", uid, ex.toString());
        }
        return new InboxMessage(
                Long.toString(uid),
                subject == null ? "" : subject,
                fromAddr != null ? nullToEmpty(fromAddr.getPersonal()) : "",
                fromAddr != null ? nullToEmpty(fromAddr.getAddress()) : "",
                received,
                snippet,
                seen,
                hasAttachments, securityPurpose(msg) != 0);
    }

    // ---------- message detail ----------

    public MessageDetail getMessage(UUID userId, UUID mailboxId, String messageId) {
        Mailbox mb = mailboxes.getReadable(userId, mailboxId);
        return getMessage(mb, messageId, ownerVisibleFrom(mb), access.isLocked(userId, mailboxId));
    }

    /** Ownership-free variant — see {@link #listInbox(Mailbox, int, int)}. */
    public MessageDetail getMessage(Mailbox mb, String messageId) {
        return getMessage(mb, messageId, null, false);
    }

    private MessageDetail getMessage(Mailbox mb, String messageId, Instant visibleFrom, boolean recovery) {
        UUID mailboxId = mb.getId();
        long uid = parseUid(messageId);
        try (var lease = pool.lease(mb)) {
            Store store = lease.store();
            IMAPFolder inbox = (IMAPFolder) store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            try {
                Message msg = inbox.getMessageByUID(uid);
                if (msg == null || (!isVisible(msg, visibleFrom) || (recovery && !isCriticalRecovery(msg)))) {
                    throw new MessageNotFoundException("Message " + messageId + " not found");
                }
                return toDetail(inbox, (MimeMessage) msg);
            } finally {
                silentClose(inbox);
            }
        } catch (MessagingException e) {
            pool.invalidate(mb.getId());
            throw new IllegalStateException("IMAP getMessage failed for mailbox " + mailboxId, e);
        }
    }

    private MessageDetail toDetail(IMAPFolder folder, MimeMessage msg) throws MessagingException {
        long uid;
        try { uid = folder.getUID(msg); } catch (MessagingException e) { uid = -1; }
        Address[] from = msg.getFrom();
        InternetAddress fromAddr = firstInternetAddress(from);
        String subject = safeDecode(msg.getSubject());
        Instant received = safeReceivedAt(msg);
        boolean seen = msg.isSet(Flags.Flag.SEEN);
        List<String> to = addressListToStrings(msg.getRecipients(Message.RecipientType.TO));
        List<String> cc = addressListToStrings(msg.getRecipients(Message.RecipientType.CC));

        BodyAndAttachments body;
        try {
            body = extractBody(msg);
        } catch (IOException | MessagingException e) {
            log.warn("body extract failed for uid {}: {}", uid, e.toString());
            body = new BodyAndAttachments(null, "", List.of());
        }
        return new MessageDetail(
                Long.toString(uid),
                subject == null ? "" : subject,
                fromAddr != null ? nullToEmpty(fromAddr.getPersonal()) : "",
                fromAddr != null ? nullToEmpty(fromAddr.getAddress()) : "",
                to,
                cc,
                received,
                body.html,
                body.plain,
                body.attachments,
                seen, securityPurpose(msg) != 0);
    }

    // ---------- mark as read ----------

    /**
     * Sets the \Seen flag on one message. Called by the webmail when the user
     * opens a message, so the inbox reflects what's actually been read. This
     * is the only READ_WRITE folder open in the service — it touches exactly
     * one flag on one UID and closes with {@code close(false)} (never expunge).
     * Idempotent: marking an already-seen message is a no-op.
     */
    public void markSeen(UUID userId, UUID mailboxId, String messageId) {
        Mailbox mb = mailboxes.getReadable(userId, mailboxId);
        Instant visibleFrom = ownerVisibleFrom(mb);
        long uid = parseUid(messageId);
        boolean recovery = access.isLocked(userId, mailboxId);
        try (var lease = pool.lease(mb)) {
            Store store = lease.store();
            IMAPFolder inbox = (IMAPFolder) store.getFolder("INBOX");
            inbox.open(Folder.READ_WRITE);
            try {
                Message msg = inbox.getMessageByUID(uid);
                if (msg == null || (!isVisible(msg, visibleFrom) || (recovery && !isCriticalRecovery(msg)))) {
                    throw new MessageNotFoundException("Message " + messageId + " not found");
                }
                if (!msg.isSet(Flags.Flag.SEEN)) {
                    msg.setFlag(Flags.Flag.SEEN, true);
                }
                summaryCache.remove(mailboxId);
            } finally {
                silentClose(inbox);
            }
        } catch (MessagingException e) {
            pool.invalidate(mb.getId());
            throw new IllegalStateException("IMAP markSeen failed for mailbox " + mailboxId, e);
        }
    }

    // ---------- attachment download ----------

    public AttachmentPayload getAttachment(UUID userId, UUID mailboxId, String messageId,
                                           String attachmentId) {
        Mailbox mb = mailboxes.getReadable(userId, mailboxId);
        return getAttachment(mb, messageId, attachmentId, ownerVisibleFrom(mb), access.isLocked(userId, mailboxId));
    }

    /** Ownership-free variant — see {@link #listInbox(Mailbox, int, int)}. */
    public AttachmentPayload getAttachment(Mailbox mb, String messageId, String attachmentId) {
        return getAttachment(mb, messageId, attachmentId, null, false);
    }

    private AttachmentPayload getAttachment(Mailbox mb, String messageId, String attachmentId,
                                            Instant visibleFrom, boolean recovery) {
        UUID mailboxId = mb.getId();
        long uid = parseUid(messageId);
        try (var lease = pool.lease(mb)) {
            Store store = lease.store();
            IMAPFolder inbox = (IMAPFolder) store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            try {
                Message msg = inbox.getMessageByUID(uid);
                if (msg == null || (!isVisible(msg, visibleFrom) || (recovery && !isCriticalRecovery(msg)))) {
                    throw new MessageNotFoundException("Message " + messageId + " not found");
                }
                Part part;
                try {
                    part = locatePart(msg, attachmentId);
                } catch (IOException e) {
                    throw new IllegalStateException("Failed to walk MIME tree", e);
                }
                if (part == null || !isAttachment(part)) {
                    throw new MessageNotFoundException(
                            "Attachment " + attachmentId + " not found on message " + messageId);
                }
                byte[] bytes;
                try (InputStream in = part.getInputStream();
                     ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    in.transferTo(out);
                    bytes = out.toByteArray();
                } catch (IOException e) {
                    throw new IllegalStateException("Failed to read attachment stream", e);
                }
                String filename = safeDecode(part.getFileName());
                String contentType = firstContentType(part);
                return new AttachmentPayload(bytes, filename, contentType);
            } finally {
                silentClose(inbox);
            }
        } catch (MessagingException e) {
            pool.invalidate(mb.getId());
            throw new IllegalStateException("IMAP getAttachment failed for mailbox " + mailboxId, e);
        }
    }

    public record AttachmentPayload(byte[] bytes, String filename, String contentType) {}

    public record ArchivePayload(byte[] bytes, String nextBeforeUid) {}
    public record CleanupResult(int deleted) {}
    private static final int MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;

    /** Explicit owner portability exports full visible history, including in RECOVERY. */
    public ArchivePayload exportArchive(UUID owner, UUID mailboxId, int limit, String beforeUid) {
        Mailbox mb = mailboxes.getOwned(owner, mailboxId);
        if (mb.getDeletedAt() != null) throw new jakarta.persistence.EntityNotFoundException("Mailbox " + mailboxId);
        if (limit < 1 || limit > 100) throw invalidCleanup("Export limit must be between 1 and 100");
        long cursor = beforeUid == null ? Long.MAX_VALUE : positiveUid(beforeUid);
        try (var lease = pool.lease(mb)) {
            Store store = lease.store();
            IMAPFolder inbox = (IMAPFolder) store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            try {
                var candidates = new ArrayList<Message>();
                for (Message msg : visibleMessages(inbox, ownerVisibleFrom(mb), false))
                    if (inbox.getUID(msg) < cursor) candidates.add(msg);
                candidates.sort((a,b) -> { try { return Long.compare(inbox.getUID(b), inbox.getUID(a)); }
                                          catch (MessagingException e) { throw new IllegalStateException(e); } });
                int count = Math.min(limit, candidates.size());
                var bytes = new BoundedBytes(MAX_ARCHIVE_BYTES);
                var ids = new ArrayList<String>();
                long remaining = MAX_ARCHIVE_BYTES - 8192;
                try (var zip = new java.util.zip.ZipOutputStream(bytes)) {
                    for (int i=0; i<count; i++) {
                        Message msg = candidates.get(i);
                        var raw = new BoundedBytes((int) remaining);
                        msg.writeTo(raw);
                        remaining -= raw.size();
                        String uid = Long.toString(inbox.getUID(msg)); ids.add(uid);
                        zip.putNextEntry(new java.util.zip.ZipEntry(uid + ".eml"));
                        raw.writeTo(zip); zip.closeEntry();
                    }
                    String next = candidates.size() > count && count > 0 ? ids.getLast() : null;
                    String manifest = "{\"mailboxId\":\""+mailboxId+"\",\"messageIds\":"
                            + new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(ids)
                            + ",\"nextBeforeUid\":"+(next == null ? "null" : "\""+next+"\"")+"}";
                    zip.putNextEntry(new java.util.zip.ZipEntry("manifest.json"));
                    zip.write(manifest.getBytes(java.nio.charset.StandardCharsets.UTF_8)); zip.closeEntry();
                }
                return new ArchivePayload(bytes.toByteArray(), candidates.size() > count && count > 0 ? ids.getLast() : null);
            } finally { silentClose(inbox); }
        } catch (MessagingException | IOException e) {
            pool.invalidate(mailboxId);
            throw new IllegalStateException("Mailbox export unavailable", e);
        }
    }

    /** Only exact, explicitly selected UIDs; UID EXPUNGE cannot remove unrelated Deleted mail. */
    @org.springframework.transaction.annotation.Transactional
    public CleanupResult cleanup(UUID owner, UUID mailboxId, List<String> messageIds, boolean confirmDelete) {
        if (!confirmDelete || messageIds == null || messageIds.isEmpty() || messageIds.size() > 100
                || new java.util.HashSet<>(messageIds).size() != messageIds.size())
            throw invalidCleanup("Confirm deletion of 1–100 distinct selected messages");
        var uids = messageIds.stream().map(MailService::positiveUid).toList();
        if (new java.util.HashSet<>(uids).size() != uids.size()) throw invalidCleanup("Select distinct message UIDs");
        Mailbox mb = mailboxes.getOwned(owner, mailboxId);
        if (mb.getDeletedAt() != null) throw new jakarta.persistence.EntityNotFoundException("Mailbox " + mailboxId);
        mb = mailboxes.getOwnedForCleanup(owner, mailboxId);
        preservation.assertNotProtected(mailboxId);
        try (var lease = pool.lease(mb)) {
            Store store = lease.store();
            if (!(store instanceof org.eclipse.angus.mail.imap.IMAPStore imap) || !imap.hasCapability("UIDPLUS"))
                throw new uz.efbazaar.trade.common.exception.ApiCodeException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                        "safe_cleanup_unavailable", "Mail server does not support exact-message cleanup");
            IMAPFolder inbox = (IMAPFolder) store.getFolder("INBOX");
            inbox.open(Folder.READ_WRITE);
            try {
                List<Message> selected = new ArrayList<>();
                List<Message> newlyFlagged = new ArrayList<>();
                for (long uid : uids) {
                    Message msg = inbox.getMessageByUID(uid);
                    if (msg == null || !isVisible(msg, ownerVisibleFrom(mb)))
                        throw new MessageNotFoundException("Message not found");
                    if (securityPurpose(msg) != 0) throw new uz.efbazaar.trade.common.exception.ApiCodeException(
                            org.springframework.http.HttpStatus.CONFLICT, "critical_mail_protected", "Recovery and security messages are protected");
                    selected.add(msg);
                    if (!msg.isSet(Flags.Flag.DELETED)) newlyFlagged.add(msg);
                }
                // Validate every UID and hold before the first destructive flag is written.
                preservation.assertNotProtected(mailboxId);
                try {
                    for (Message msg : newlyFlagged) msg.setFlag(Flags.Flag.DELETED, true);
                    inbox.expunge(selected.toArray(Message[]::new));
                } catch (MessagingException e) {
                    for (Message msg : newlyFlagged) try { msg.setFlag(Flags.Flag.DELETED, false); } catch (MessagingException ignored) { }
                    throw e;
                }
                summaryCache.remove(mailboxId);
                return new CleanupResult(selected.size());
            } finally { silentClose(inbox); }
        } catch (MessagingException e) {
            pool.invalidate(mailboxId); throw new IllegalStateException("Mailbox cleanup unavailable", e);
        }
    }

    private static long positiveUid(String raw) {
        try { long uid = Long.parseLong(raw); if (uid > 0) return uid; } catch (RuntimeException ignored) { }
        throw invalidCleanup("Message IDs must be positive IMAP UIDs");
    }

    private static org.springframework.web.server.ResponseStatusException invalidCleanup(String message) {
        return new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, message);
    }

    private static final class BoundedBytes extends ByteArrayOutputStream {
        private final int limit;
        BoundedBytes(int limit) { this.limit = limit; }
        @Override public synchronized void write(int value) { check(1); super.write(value); }
        @Override public synchronized void write(byte[] data, int offset, int length) { check(length); super.write(data, offset, length); }
        private void check(int additional) {
            if (additional > limit - count) throw new uz.efbazaar.trade.common.exception.ApiCodeException(
                    org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE, "export_too_large", "Choose a smaller export page (128 MiB maximum)");
        }
    }

    // Require an exact sender, known security subject, and matching purpose in the message body.
    private static int securityPurpose(Message message) throws MessagingException {
        Address[] senders = message.getFrom();
        if (senders == null || senders.length != 1 || !(senders[0] instanceof InternetAddress from)
                || from.getAddress() == null) return 0;
        if (!java.util.Set.of("noreply@konami.com", "no-reply@konami.jp", "noreply@konami.net", "konami-info@konami.net")
                .contains(from.getAddress().toLowerCase(java.util.Locale.ROOT))) return 0;
        String raw = message.getSubject(); if (raw == null) return 0;
        String subject = java.text.Normalizer.normalize(safeDecode(raw), java.text.Normalizer.Form.NFKC)
                .toLowerCase(java.util.Locale.ROOT).replaceAll("\\s+", " ").strip();
        boolean reset = java.util.Set.of("[konami id] reissue password", "【konami id】パスワードの再発行").contains(subject);
        boolean code = java.util.Set.of("[konami id] update email address", "【konami id】メールアドレスの更新",
                "[konami id] save data transfer to new device", "[konami id] verification code",
                "【konami id】ログイン用の確認コード").contains(subject);
        return reset ? 1 : code ? 2 : 0;
    }

    private static boolean isCriticalRecovery(Message message) throws MessagingException {
        int purpose = securityPurpose(message);
        if (purpose == 0) return false;
        final String body;
        try { body = securityText(message, 0); } catch (IOException | MessagingException e) { return false; }
        if (purpose == 1) return java.util.regex.Pattern.compile(
                "https://my\\.konami\\.net/[a-zA-Z0-9_/-]*(?:password-reminder|register-password|password/reset)[^\\s<>\"]*",
                java.util.regex.Pattern.CASE_INSENSITIVE).matcher(body).find()
                || java.util.regex.Pattern.compile("not\\s+registered\\s+to\\s+a\\s+konami\\s+id", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(body).find();
        return java.util.regex.Pattern.compile("(?<!\\d)\\d{6}(?!\\d)").matcher(body).find();
    }

    /** Classification never opens attachments, and unknown/oversized nesting fails closed. */
    private static String securityText(Part part, int depth) throws MessagingException, IOException {
        if (depth > 10 || Part.ATTACHMENT.equalsIgnoreCase(part.getDisposition())) return "";
        Object content = part.getContent();
        if (content instanceof String text) return text.substring(0, Math.min(text.length(), 65_536));
        if (content instanceof Multipart multi) {
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < Math.min(20, multi.getCount()) && out.length() < 65_536; i++) {
                String text = securityText(multi.getBodyPart(i), depth + 1);
                out.append(text, 0, Math.min(text.length(), 65_536 - out.length()));
            }
            return out.toString();
        }
        return "";
    }

    // ---------- helpers: MIME walking ----------

    private BodyAndAttachments extractBody(Part root) throws IOException, MessagingException {
        StringBuilder plain = new StringBuilder();
        StringBuilder html = new StringBuilder();
        List<AttachmentMeta> attachments = new ArrayList<>();
        walk(root, "", plain, html, attachments);
        String sanitisedHtml = html.length() > 0 ? sanitizer.sanitize(html.toString()) : null;
        String plainText = plain.length() > 0 ? plain.toString() : (sanitisedHtml == null ? "" : null);
        return new BodyAndAttachments(sanitisedHtml, plainText, attachments);
    }

    private void walk(Part part, String idPrefix,
                      StringBuilder plain, StringBuilder html,
                      List<AttachmentMeta> attachments) throws IOException, MessagingException {
        if (part == null) return;
        String disposition = safeGetDisposition(part);
        boolean explicitAttachment = Part.ATTACHMENT.equalsIgnoreCase(disposition);
        if (explicitAttachment && idPrefix.length() > 0) {
            attachments.add(new AttachmentMeta(
                    idPrefix.isEmpty() ? "0" : idPrefix,
                    safeDecode(part.getFileName()),
                    firstContentType(part),
                    part.getSize() < 0 ? 0 : part.getSize()));
            return;
        }

        Object content;
        try {
            content = part.getContent();
        } catch (IOException | MessagingException e) {
            // Undecipherable part — treat as attachment placeholder rather than crash.
            attachments.add(new AttachmentMeta(
                    idPrefix.isEmpty() ? "0" : idPrefix,
                    safeDecode(part.getFileName()),
                    firstContentType(part),
                    part.getSize() < 0 ? 0 : part.getSize()));
            return;
        }
        if (content instanceof Multipart mp) {
            for (int i = 0; i < mp.getCount(); i++) {
                String childId = idPrefix.isEmpty()
                        ? Integer.toString(i + 1)
                        : idPrefix + "." + (i + 1);
                walk(mp.getBodyPart(i), childId, plain, html, attachments);
            }
        } else if (part.isMimeType("text/plain") && !explicitAttachment) {
            plain.append(content instanceof String s ? s : String.valueOf(content));
        } else if (part.isMimeType("text/html") && !explicitAttachment) {
            html.append(content instanceof String s ? s : String.valueOf(content));
        } else {
            attachments.add(new AttachmentMeta(
                    idPrefix.isEmpty() ? "0" : idPrefix,
                    safeDecode(part.getFileName()),
                    firstContentType(part),
                    part.getSize() < 0 ? 0 : part.getSize()));
        }
    }

    private Part locatePart(Part root, String attachmentId) throws IOException, MessagingException {
        if (attachmentId == null || attachmentId.isBlank()) return null;
        String[] segments = attachmentId.split("\\.");
        int[] path = new int[segments.length];
        try {
            for (int i = 0; i < segments.length; i++) path[i] = Integer.parseInt(segments[i]);
        } catch (NumberFormatException e) {
            return null;
        }
        Part cursor = root;
        for (int idx : path) {
            Object content;
            try {
                content = cursor.getContent();
            } catch (IOException | MessagingException e) {
                return null;
            }
            if (!(content instanceof Multipart mp)) return null;
            if (idx < 1 || idx > mp.getCount()) return null;
            cursor = mp.getBodyPart(idx - 1);
        }
        return cursor;
    }

    // Inbox-row helpers

    private SnippetAndAttachments extractSnippetAndAttachmentFlag(MimeMessage msg) throws IOException, MessagingException {
        String plain = firstPlainText(msg);
        boolean hasAttachments = walkForAttachmentFlag(msg);
        String snippet = plain == null ? "" : condenseWhitespace(plain);
        if (snippet.length() > SNIPPET_LENGTH) snippet = snippet.substring(0, SNIPPET_LENGTH);
        return new SnippetAndAttachments(snippet, hasAttachments);
    }

    private String firstPlainText(Part part) throws IOException, MessagingException {
        if (part == null) return null;
        String disposition = safeGetDisposition(part);
        if (Part.ATTACHMENT.equalsIgnoreCase(disposition)) return null;
        Object content;
        try { content = part.getContent(); } catch (IOException | MessagingException e) { return null; }
        if (content instanceof Multipart mp) {
            for (int i = 0; i < mp.getCount(); i++) {
                String s = firstPlainText(mp.getBodyPart(i));
                if (s != null && !s.isBlank()) return s;
            }
            return null;
        }
        if (part.isMimeType("text/plain")) {
            return content instanceof String s ? s : String.valueOf(content);
        }
        if (part.isMimeType("text/html") && content instanceof String s) {
            // Fallback: strip tags to derive a plain snippet.
            return org.jsoup.Jsoup.parse(s).text();
        }
        return null;
    }

    private boolean walkForAttachmentFlag(Part part) throws IOException, MessagingException {
        if (part == null) return false;
        String disposition = safeGetDisposition(part);
        if (Part.ATTACHMENT.equalsIgnoreCase(disposition)) return true;
        Object content;
        try { content = part.getContent(); } catch (IOException | MessagingException e) { return false; }
        if (content instanceof Multipart mp) {
            for (int i = 0; i < mp.getCount(); i++) {
                if (walkForAttachmentFlag(mp.getBodyPart(i))) return true;
            }
        }
        return false;
    }

    private boolean isAttachment(Part part) throws MessagingException {
        return Part.ATTACHMENT.equalsIgnoreCase(safeGetDisposition(part))
                || (part.getFileName() != null && !part.getFileName().isBlank());
    }

    /** A missing persisted boundary must never fall back to unrestricted owner access. */
    private static Instant ownerVisibleFrom(Mailbox mailbox) {
        if (mailbox.getOwnerMailVisibleFrom() != null) return mailbox.getOwnerMailVisibleFrom();
        if (mailbox.getHandedOffAt() != null) return mailbox.getHandedOffAt();
        return mailbox.getCreatedAt() != null ? mailbox.getCreatedAt() : Instant.now();
    }

    private static boolean isVisible(Message message, Instant visibleFrom) throws MessagingException {
        if (visibleFrom == null) return true; // Only the explicitly admin-authorized overloads.
        // IMAP INTERNALDATE, never the sender-controlled Date header.
        java.util.Date received = message.getReceivedDate();
        return received != null && !received.toInstant().isBefore(visibleFrom);
    }

    private static Message[] visibleMessages(Folder inbox, Instant visibleFrom, boolean recovery) throws MessagingException {
        // IMAP SINCE has calendar-day precision. Widen by a day for timezone offsets,
        // then apply the exact instant boundary locally before returning any metadata.
        Message[] candidates = inbox.search(new ReceivedDateTerm(ComparisonTerm.GE,
                java.util.Date.from(visibleFrom.minusSeconds(86_400))));
        jakarta.mail.FetchProfile profile = new jakarta.mail.FetchProfile();
        profile.add(jakarta.mail.FetchProfile.Item.ENVELOPE);
        profile.add(jakarta.mail.FetchProfile.Item.FLAGS);
        inbox.fetch(candidates, profile);
        List<Message> visible = new ArrayList<>();
        for (Message message : candidates) {
            if (message != null && isVisible(message, visibleFrom) && (!recovery || isCriticalRecovery(message))) visible.add(message);
        }
        return visible.toArray(Message[]::new);
    }

    // ---------- misc helpers ----------

    private static long parseUid(String raw) {
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw new MessageNotFoundException("Invalid message id: " + raw);
        }
    }

    private static InternetAddress firstInternetAddress(Address[] addrs) {
        if (addrs == null) return null;
        return Stream.of(addrs)
                .filter(InternetAddress.class::isInstance)
                .map(InternetAddress.class::cast)
                .findFirst()
                .orElse(null);
    }

    private static List<String> addressListToStrings(Address[] addrs) {
        if (addrs == null || addrs.length == 0) return Collections.emptyList();
        return Arrays.stream(addrs)
                .filter(InternetAddress.class::isInstance)
                .map(a -> ((InternetAddress) a).toUnicodeString())
                .toList();
    }

    private static String safeDecode(String s) {
        if (s == null) return null;
        try { return MimeUtility.decodeText(s); }
        catch (Exception e) { return s; }
    }

    private static Instant safeReceivedAt(MimeMessage msg) {
        try {
            java.util.Date d = msg.getReceivedDate();
            if (d == null) d = msg.getSentDate();
            return d == null ? Instant.EPOCH : d.toInstant();
        } catch (MessagingException e) {
            return Instant.EPOCH;
        }
    }

    private static String safeGetDisposition(Part p) {
        try { return p.getDisposition(); } catch (MessagingException e) { return null; }
    }

    private static String firstContentType(Part p) {
        try {
            String ct = p.getContentType();
            if (ct == null) return "application/octet-stream";
            int semi = ct.indexOf(';');
            return semi > 0 ? ct.substring(0, semi).trim() : ct.trim();
        } catch (MessagingException e) {
            return "application/octet-stream";
        }
    }

    private static String nullToEmpty(String s) { return s == null ? "" : s; }

    private static String condenseWhitespace(String in) {
        return in.replaceAll("\\s+", " ").trim();
    }

    private static void silentClose(Folder f) {
        try { if (f != null && f.isOpen()) f.close(false); }
        catch (MessagingException ignored) {}
    }

    private record BodyAndAttachments(String html, String plain, List<AttachmentMeta> attachments) {}
    private record SnippetAndAttachments(String snippet, boolean hasAttachments) {}
}
