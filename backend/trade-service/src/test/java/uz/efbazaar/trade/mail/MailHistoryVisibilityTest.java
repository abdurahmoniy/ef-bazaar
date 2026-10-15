package uz.efbazaar.trade.mail;

import jakarta.mail.*;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.search.SearchTerm;
import org.eclipse.angus.mail.imap.IMAPFolder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.service.*;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class MailHistoryVisibilityTest {
    private final UUID owner = UUID.randomUUID();
    private final Instant cutoff = Instant.parse("2026-09-23T10:30:00Z");
    private final Mailbox box = Mailbox.builder().id(UUID.randomUUID()).ownerUserId(owner)
            .email("box@example.test").handedOffAt(cutoff).build();
    private final MailboxService boxes = mock(MailboxService.class);
    private final ImapConnectionPool pool = mock(ImapConnectionPool.class);
    private final IMAPFolder inbox = mock(IMAPFolder.class);
    private final MailService service = new MailService(boxes, pool, new HtmlSanitizer(), mock(uz.efbazaar.trade.plan.service.MailboxAccessService.class));
    private MimeMessage old, current, latest, undated;

    @BeforeEach void setup() throws Exception {
        Store store = mock(Store.class);
        when(boxes.getReadable(owner, box.getId())).thenReturn(box);
        when(boxes.listOwnedBy(owner)).thenReturn(List.of(box));
        when(pool.acquire(box)).thenReturn(store);
        when(store.getFolder("INBOX")).thenReturn(inbox);
        old = message(1, cutoff.minusSeconds(1), false);
        current = message(2, cutoff, true);
        latest = message(3, cutoff.plusSeconds(30), false);
        undated = message(4, null, false);
        // A forged Date header must not grant access to old/undated messages.
        when(old.getSentDate()).thenReturn(Date.from(cutoff.plusSeconds(100)));
        when(undated.getSentDate()).thenReturn(Date.from(cutoff.plusSeconds(100)));
        Message[] all = {old, current, latest, undated};
        when(inbox.getMessageCount()).thenReturn(4);
        when(inbox.getUnreadMessageCount()).thenReturn(3);
        when(inbox.getMessage(4)).thenReturn(undated);
        when(inbox.getMessages(anyInt(), anyInt())).thenAnswer(inv -> {
            int start = inv.getArgument(0), end = inv.getArgument(1);
            return Arrays.copyOfRange(all, start - 1, end);
        });
        // IMAP date search is day-granular: intentionally return same-day old mail.
        when(inbox.search(any(SearchTerm.class))).thenReturn(all);
    }

    private MimeMessage message(long uid, Instant received, boolean seen) throws Exception {
        MimeMessage msg = mock(MimeMessage.class);
        when(msg.getReceivedDate()).thenReturn(received == null ? null : Date.from(received));
        when(msg.isSet(Flags.Flag.SEEN)).thenReturn(seen);
        when(msg.getSubject()).thenReturn("message-" + uid);
        when(inbox.getUID(msg)).thenReturn(uid);
        when(inbox.getMessageByUID(uid)).thenReturn(msg);
        return msg;
    }

    @Test void filtersBeforePaginationAndDoesNotExposeOldTotals() {
        var first = service.listInbox(owner, box.getId(), 1, 0);
        assertThat(first.total()).isEqualTo(2);
        assertThat(first.messages()).extracting(m -> m.messageId()).containsExactly("3");
        var second = service.listInbox(owner, box.getId(), 1, 1);
        assertThat(second.messages()).extracting(m -> m.messageId()).containsExactly("2");
        assertThat(service.listInbox(owner, box.getId(), 1, 2).messages()).isEmpty();
    }

    @Test void blocksDirectOldAndUndatedMessagesAndAttachments() {
        for (String uid : List.of("1", "4")) {
            assertThatThrownBy(() -> service.getMessage(owner, box.getId(), uid))
                    .isInstanceOf(MessageNotFoundException.class);
            assertThatThrownBy(() -> service.getAttachment(owner, box.getId(), uid, "1"))
                    .isInstanceOf(MessageNotFoundException.class);
        }
    }

    @Test void blocksMarkingHiddenMailRead() throws Exception {
        assertThatThrownBy(() -> service.markSeen(owner, box.getId(), "1"))
                .isInstanceOf(MessageNotFoundException.class);
        verify(old, never()).setFlag(any(), anyBoolean());
        service.markSeen(owner, box.getId(), "3");
        verify(latest).setFlag(Flags.Flag.SEEN, true);
    }

    @Test void allowsCurrentTradeMailAndFiltersSidebarMetadata() {
        assertThat(service.getMessage(owner, box.getId(), "2").messageId()).isEqualTo("2");
        var summary = service.listMyMailboxes(owner).getFirst();
        assertThat(summary.unreadCount()).isEqualTo(1);
        assertThat(summary.lastActivityAt()).isEqualTo(cutoff.plusSeconds(30));
    }

    @Test void tradeBoundaryPreservesMailFromBeforeTheActualHandoff() {
        box.setOwnerMailVisibleFrom(cutoff.minusSeconds(60));
        assertThat(service.getMessage(owner, box.getId(), "1").messageId()).isEqualTo("1");
    }

    @Test void noVisibleMailMeansNoUnreadOrActivityLeak() {
        box.setOwnerMailVisibleFrom(cutoff.plusSeconds(60));
        var summary = service.listMyMailboxes(owner).getFirst();
        assertThat(summary.unreadCount()).isZero();
        assertThat(summary.lastActivityAt()).isNull();
    }

    @Test void allowsAttachmentsOnlyOnVisibleMessages() throws Exception {
        var part = mock(jakarta.mail.internet.MimeBodyPart.class);
        var multipart = new jakarta.mail.internet.MimeMultipart();
        multipart.addBodyPart(part);
        when(latest.getContent()).thenReturn(multipart);
        when(part.getDisposition()).thenReturn(Part.ATTACHMENT);
        when(part.getInputStream()).thenReturn(new java.io.ByteArrayInputStream(new byte[]{1, 2}));
        when(part.getFileName()).thenReturn("current.txt");
        when(part.getContentType()).thenReturn("text/plain");
        assertThat(service.getAttachment(owner, box.getId(), "3", "1").bytes()).containsExactly(1, 2);
        assertThatThrownBy(() -> service.getAttachment(owner, box.getId(), "1", "1"))
                .isInstanceOf(MessageNotFoundException.class);
        verify(old, never()).getContent();
    }

    @Test void adminReadStillHasFullAuditHistory() {
        assertThat(service.getMessage(box, "1").messageId()).isEqualTo("1");
        assertThat(service.listInbox(box, 10, 0).total()).isEqualTo(4);
    }
}
