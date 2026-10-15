package uz.efbazaar.trade.mail;

import jakarta.persistence.EntityNotFoundException;
import jakarta.mail.MessagingException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.service.HtmlSanitizer;
import uz.efbazaar.trade.mail.service.ImapConnectionPool;
import uz.efbazaar.trade.mail.service.MailService;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Verifies that MailService always routes through {@link MailboxService#getOwned}
 * — the canonical ownership check. If a future refactor accidentally drops the
 * check, these tests fail loudly instead of silently returning another user's
 * mail.
 */
class MailServiceOwnershipTest {

    private MailboxService mailboxes;
    private ImapConnectionPool pool;
    private HtmlSanitizer sanitizer;
    private MailService svc;

    @BeforeEach
    void setUp() {
        mailboxes = mock(MailboxService.class);
        pool = mock(ImapConnectionPool.class);
        sanitizer = mock(HtmlSanitizer.class);
        svc = new MailService(mailboxes, pool, sanitizer, mock(uz.efbazaar.trade.plan.service.MailboxAccessService.class));
    }

    @Test
    void summaryIncludesNameEvenWhenImapIsUnavailable() throws Exception {
        var box = Mailbox.builder()
                .id(UUID.randomUUID()).email("box@efbazaar.uz").displayName("Main account").build();
        when(pool.acquire(box)).thenThrow(new MessagingException("offline"));

        var summary = svc.summarize(List.of(box)).getFirst();

        assertThat(summary.displayName()).isEqualTo("Main account");
        assertThat(summary.email()).isEqualTo("box@efbazaar.uz");
        assertThat(summary.unreadCount()).isNull();
    }

    @Test
    void lockedMailboxSummaryHasNoActivityAndNeverOpensImap() throws Exception {
        UUID owner = UUID.randomUUID();
        var box = Mailbox.builder().id(UUID.randomUUID()).email("locked@efbazaar.uz").build();
        var access = mock(uz.efbazaar.trade.plan.service.MailboxAccessService.class);
        when(access.lockedIds(owner)).thenReturn(java.util.Set.of(box.getId()));
        when(mailboxes.listOwnedBy(owner)).thenReturn(List.of(box));
        var local = new MailService(mailboxes, pool, sanitizer, access);

        var summary = local.listMyMailboxes(owner).getFirst();

        assertThat(summary.locked()).isTrue();
        assertThat(summary.unreadCount()).isNull();
        assertThat(summary.lastActivityAt()).isNull();
        org.mockito.Mockito.verifyNoInteractions(pool);
    }

    @Test
    void listInboxCallsGetOwnedWithCallerId() {
        UUID caller = UUID.randomUUID();
        UUID mailbox = UUID.randomUUID();
        // Simulate mailbox not owned by caller — MailboxService throws.
        when(mailboxes.getOwned(caller, mailbox))
                .thenThrow(new EntityNotFoundException("nope"));

        assertThatThrownBy(() -> svc.listInbox(caller, mailbox, 10, 0))
                .isInstanceOf(EntityNotFoundException.class);
        verify(mailboxes).getOwned(eq(caller), eq(mailbox));
    }

    @Test
    void getMessageCallsGetOwnedWithCallerId() {
        UUID caller = UUID.randomUUID();
        UUID mailbox = UUID.randomUUID();
        when(mailboxes.getOwned(caller, mailbox))
                .thenThrow(new EntityNotFoundException("nope"));

        assertThatThrownBy(() -> svc.getMessage(caller, mailbox, "42"))
                .isInstanceOf(EntityNotFoundException.class);
        verify(mailboxes).getOwned(eq(caller), eq(mailbox));
    }

    @Test
    void getAttachmentCallsGetOwnedWithCallerId() {
        UUID caller = UUID.randomUUID();
        UUID mailbox = UUID.randomUUID();
        when(mailboxes.getOwned(caller, mailbox))
                .thenThrow(new EntityNotFoundException("nope"));

        assertThatThrownBy(() -> svc.getAttachment(caller, mailbox, "42", "1"))
                .isInstanceOf(EntityNotFoundException.class);
        verify(mailboxes).getOwned(eq(caller), eq(mailbox));
    }
}
