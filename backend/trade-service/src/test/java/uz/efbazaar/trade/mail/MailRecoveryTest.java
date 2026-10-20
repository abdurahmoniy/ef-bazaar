package uz.efbazaar.trade.mail;
import jakarta.mail.*;
import jakarta.mail.internet.*;
import jakarta.mail.search.SearchTerm;
import org.eclipse.angus.mail.imap.IMAPFolder;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.service.*;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
class MailRecoveryTest {
 @org.junit.jupiter.params.ParameterizedTest
 @org.junit.jupiter.params.provider.ValueSource(strings={"noreply@konami.com","no-reply@konami.jp","noreply@konami.net","konami-info@konami.net"})
 void recoveryFiltersBeforeCountsPagingAndDirectUidAccess(String trustedSender) throws Exception {
    UUID owner=UUID.randomUUID();
    Mailbox box=Mailbox.builder().id(UUID.randomUUID()).ownerUserId(owner).createdAt(Instant.EPOCH).build();
    var boxes=mock(MailboxService.class);var pool=mock(ImapConnectionPool.class);
    var access=mock(MailboxAccessService.class);var store=mock(Store.class);var folder=mock(IMAPFolder.class);
    when(boxes.getReadable(owner,box.getId())).thenReturn(box);
    when(access.isLocked(owner,box.getId())).thenReturn(true);
    when(pool.lease(box)).thenReturn(new ImapConnectionPool.Lease(store, () -> {}));when(store.getFolder("INBOX")).thenReturn(folder);
    MimeMessage critical=message(trustedSender,"[KONAMI ID] Reissue Password");
    MimeMessage marketing=message(trustedSender,"KONAMI campaign");
    MimeMessage forged=message("attacker@example.test","[KONAMI ID] Reissue Password");
    MimeMessage subjectOnly = message(trustedSender,"[KONAMI ID] Reissue Password");
    when(subjectOnly.getContent()).thenReturn("Unrelated newsletter discount content");
    when(folder.search(any(SearchTerm.class))).thenReturn(new Message[]{critical,marketing,forged,subjectOnly});
    when(folder.getUID(critical)).thenReturn(1L);
    when(folder.getMessageByUID(2)).thenReturn(marketing);when(folder.getMessageByUID(3)).thenReturn(forged);when(folder.getMessageByUID(4)).thenReturn(subjectOnly);
    var service=new MailService(boxes,pool,new HtmlSanitizer(),access,mock(uz.efbazaar.trade.mailbox.service.MailboxPreservationService.class));
    var page=service.listInbox(owner,box.getId(),1,0);
    assertThat(page.total()).isEqualTo(1);
    assertThat(page.messages()).extracting(m->m.messageId()).containsExactly("1");
    for (String uid:List.of("2","3","4")) {
      assertThatThrownBy(()->service.getMessage(owner,box.getId(),uid)).isInstanceOf(MessageNotFoundException.class);
      assertThatThrownBy(()->service.getAttachment(owner,box.getId(),uid,"1")).isInstanceOf(MessageNotFoundException.class);
      assertThatThrownBy(()->service.markSeen(owner,box.getId(),uid)).isInstanceOf(MessageNotFoundException.class);
    }
    verify(marketing,never()).setFlag(any(),anyBoolean());
 }
 private MimeMessage message(String sender,String subject)throws Exception {
   MimeMessage msg=mock(MimeMessage.class);when(msg.getReceivedDate()).thenReturn(Date.from(Instant.now()));
   when(msg.getContent()).thenReturn("Reset your password: https://my.konami.net/en/password-reminder/register-password?put=fixture");
   when(msg.getFrom()).thenReturn(new Address[]{new InternetAddress(sender)});when(msg.getSubject()).thenReturn(subject);
   return msg;
 }
}
