package uz.efbazaar.trade.mail;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.service.HtmlSanitizer;
import uz.efbazaar.trade.mail.service.ImapConnectionPool;
import uz.efbazaar.trade.mail.service.MailService;
import uz.efbazaar.trade.mailbox.service.MailboxService;

import java.util.UUID;

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
        svc = new MailService(mailboxes, pool, sanitizer);
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
