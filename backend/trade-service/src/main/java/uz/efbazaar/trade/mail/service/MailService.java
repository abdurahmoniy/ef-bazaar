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
 * <p>All read paths open folders {@link Folder#READ_ONLY} so a fetch can never
 * accidentally flip flags or (worse) trigger \Deleted on expunge. The single
 * deliberate mutation is {@link #markSeen}: it opens READ_WRITE, sets exactly
 * the \Seen flag on one UID, and closes without expunge. Do not add any other
 * mutation without the same scrutiny.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailService {

    private final MailboxService mailboxes;
    private final ImapConnectionPool pool;
    private final HtmlSanitizer sanitizer;

    private static final int SNIPPET_LENGTH = 200;
    /** Cap on per-request page size so a malicious limit=1000000 can't OOM us. */
    private static final int MAX_PAGE_SIZE = 100;

    // ---------- sidebar / mailbox switcher ----------

    public List<MailboxSummary> listMyMailboxes(UUID userId) {
        return summarize(mailboxes.listOwnedBy(userId), true);
    }

    /**
     * Same sidebar shape for an arbitrary set of mailboxes — used by the admin
     * panel, which resolves the rows itself instead of going through the
     * ownership filter.
     */
    public List<MailboxSummary> summarize(List<Mailbox> owned) {
        return summarize(owned, false);
    }

    private List<MailboxSummary> summarize(List<Mailbox> owned, boolean ownerView) {
        List<MailboxSummary> out = new ArrayList<>(owned.size());
        for (Mailbox mb : owned) {
            Integer unread = null;
            Instant lastActivity = null;
            try {
                Store store = pool.acquire(mb);
                Folder inbox = store.getFolder("INBOX");
                inbox.open(Folder.READ_ONLY);
                try {
                    if (ownerView) {
                        Message[] visible = visibleMessages(inbox, ownerVisibleFrom(mb));
                        unread = 0;
                        for (Message message : visible) {
                            if (!message.isSet(Flags.Flag.SEEN)) unread++;
                            Instant received = message.getReceivedDate().toInstant();
                            if (lastActivity == null || received.isAfter(lastActivity)) lastActivity = received;
                        }
                    } else {
                        unread = inbox.getUnreadMessageCount();
                        int count = inbox.getMessageCount();
                        if (count > 0) {
                            Message latest = inbox.getMessage(count);
                            java.util.Date sent = latest.getReceivedDate();
                            if (sent == null) sent = latest.getSentDate();
                            if (sent != null) lastActivity = sent.toInstant();
                        }
                    }
                } finally {
                    silentClose(inbox);
                }
            } catch (Exception ex) {
                log.warn("Sidebar summary failed for mailbox {}: {}", mb.getId(), ex.toString());
                pool.invalidate(mb.getId());
            }
            out.add(new MailboxSummary(
                    mb.getId(),
                    mb.getEmail(),
                    mb.getDisplayName(),
                    unread,
                    lastActivity,
                    mb.getHandedOffAt() != null ? mb.getHandedOffAt() : mb.getCreatedAt()));
        }
        return out;
    }

    // ---------- inbox listing ----------

    public InboxPage listInbox(UUID userId, UUID mailboxId, int limit, int offset) {
        Mailbox mb = mailboxes.getOwned(userId, mailboxId);
        return listInbox(mb, limit, offset, ownerVisibleFrom(mb));
    }

    /**
     * Ownership-free variant. Only call it from a caller that has already
     * decided the requester may see this mailbox — today that is the
     * {@code ROLE_ADMIN}-gated admin panel.
     */
    public InboxPage listInbox(Mailbox mb, int limit, int offset) {
        return listInbox(mb, limit, offset, null);
    }

    private InboxPage listInbox(Mailbox mb, int limit, int offset, Instant visibleFrom) {
        int cappedLimit = Math.max(1, Math.min(MAX_PAGE_SIZE, limit));
        int cappedOffset = Math.max(0, offset);

        UUID mailboxId = mb.getId();
        try {
            Store store = pool.acquire(mb);
            Folder inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            try {
                Message[] visible = visibleFrom == null ? null : visibleMessages(inbox, visibleFrom);
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
                hasAttachments);
    }

    // ---------- message detail ----------

    public MessageDetail getMessage(UUID userId, UUID mailboxId, String messageId) {
        Mailbox mb = mailboxes.getOwned(userId, mailboxId);
        return getMessage(mb, messageId, ownerVisibleFrom(mb));
    }

    /** Ownership-free variant — see {@link #listInbox(Mailbox, int, int)}. */
    public MessageDetail getMessage(Mailbox mb, String messageId) {
        return getMessage(mb, messageId, null);
    }

    private MessageDetail getMessage(Mailbox mb, String messageId, Instant visibleFrom) {
        UUID mailboxId = mb.getId();
        long uid = parseUid(messageId);
        try {
            Store store = pool.acquire(mb);
            IMAPFolder inbox = (IMAPFolder) store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            try {
                Message msg = inbox.getMessageByUID(uid);
                if (msg == null || !isVisible(msg, visibleFrom)) {
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
                seen);
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
        Mailbox mb = mailboxes.getOwned(userId, mailboxId);
        Instant visibleFrom = ownerVisibleFrom(mb);
        long uid = parseUid(messageId);
        try {
            Store store = pool.acquire(mb);
            IMAPFolder inbox = (IMAPFolder) store.getFolder("INBOX");
            inbox.open(Folder.READ_WRITE);
            try {
                Message msg = inbox.getMessageByUID(uid);
                if (msg == null || !isVisible(msg, visibleFrom)) {
                    throw new MessageNotFoundException("Message " + messageId + " not found");
                }
                if (!msg.isSet(Flags.Flag.SEEN)) {
                    msg.setFlag(Flags.Flag.SEEN, true);
                }
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
        Mailbox mb = mailboxes.getOwned(userId, mailboxId);
        return getAttachment(mb, messageId, attachmentId, ownerVisibleFrom(mb));
    }

    /** Ownership-free variant — see {@link #listInbox(Mailbox, int, int)}. */
    public AttachmentPayload getAttachment(Mailbox mb, String messageId, String attachmentId) {
        return getAttachment(mb, messageId, attachmentId, null);
    }

    private AttachmentPayload getAttachment(Mailbox mb, String messageId, String attachmentId,
                                            Instant visibleFrom) {
        UUID mailboxId = mb.getId();
        long uid = parseUid(messageId);
        try {
            Store store = pool.acquire(mb);
            IMAPFolder inbox = (IMAPFolder) store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);
            try {
                Message msg = inbox.getMessageByUID(uid);
                if (msg == null || !isVisible(msg, visibleFrom)) {
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

    private static Message[] visibleMessages(Folder inbox, Instant visibleFrom) throws MessagingException {
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
            if (message != null && isVisible(message, visibleFrom)) visible.add(message);
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
