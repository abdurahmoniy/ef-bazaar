package uz.efbazaar.trade.mail;
import jakarta.mail.*;
import jakarta.mail.internet.*;
import jakarta.mail.search.SearchTerm;
import org.eclipse.angus.mail.imap.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.service.*;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.*;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import java.time.*;
import java.util.*;
import java.io.*;
import java.util.zip.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
class MailArchiveCleanupTest {
 private final UUID user=UUID.randomUUID(); private final Instant cutoff=Instant.parse("2026-10-01T00:00:00Z");
 private final Mailbox box=Mailbox.builder().id(UUID.randomUUID()).ownerUserId(user).ownerMailVisibleFrom(cutoff).build();
 private final MailboxService boxes=mock(MailboxService.class);private final ImapConnectionPool pool=mock(ImapConnectionPool.class);
 private final IMAPStore store=mock(IMAPStore.class); private final IMAPFolder folder=mock(IMAPFolder.class);
 private final MailboxPreservationService preservation=mock(MailboxPreservationService.class);
 private final MailService service=new MailService(boxes,pool,new HtmlSanitizer(),mock(MailboxAccessService.class),preservation);
 @BeforeEach void setup() throws Exception {
   when(boxes.getOwned(user,box.getId())).thenReturn(box);when(boxes.getOwnedForCleanup(user,box.getId())).thenReturn(box);when(pool.lease(box)).thenReturn(new ImapConnectionPool.Lease(store, () -> {}));
   when(store.getFolder("INBOX")).thenReturn(folder);when(store.hasCapability("UIDPLUS")).thenReturn(true);
 }
 private MimeMessage msg(long uid,Instant received,boolean critical) throws Exception {
  MimeMessage msg=mock(MimeMessage.class);when(msg.getReceivedDate()).thenReturn(Date.from(received));
  when(msg.getSubject()).thenReturn(critical?"[KONAMI ID] Reissue Password":"Newsletter");
  when(msg.getContent()).thenReturn(critical?"https://my.konami.net/en/password-reminder/register-password?put=fixture":"Newsletter");
  when(msg.getFrom()).thenReturn(new Address[]{new InternetAddress("noreply@konami.com")});
  when(folder.getUID(msg)).thenReturn(uid);when(folder.getMessageByUID(uid)).thenReturn(msg);
  doAnswer(i->{((OutputStream)i.getArgument(0)).write(("Subject: test\r\n\r\nMessage "+uid).getBytes());return null;}).when(msg).writeTo(any(OutputStream.class));
  return msg;
 }
 @Test void exportsFullVisibleArchiveAsBoundedCursorPagesEvenForRecovery() throws Exception {
   var old=msg(1,cutoff.minusSeconds(1),false);var a=msg(2,cutoff,false);var b=msg(3,cutoff.plusSeconds(1),true);
   when(folder.search(any(SearchTerm.class))).thenReturn(new Message[]{old,a,b});
   var first=service.exportArchive(user,box.getId(),1,null);
   assertThat(first.nextBeforeUid()).isEqualTo("3");
   assertThat(entries(first.bytes())).containsExactly("3.eml","manifest.json");
   var second=service.exportArchive(user,box.getId(),1,"3");
   assertThat(second.nextBeforeUid()).isNull();assertThat(entries(second.bytes())).containsExactly("2.eml","manifest.json");
 }
 private List<String> entries(byte[] bytes)throws Exception {
  var entries=new ArrayList<String>();try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes))) {
   for(ZipEntry e;(e=zip.getNextEntry())!=null;)entries.add(e.getName());
  }return entries;
 }
 @Test void cleanupExpungesOnlySelectedUidsAndNeverWholeFolder()throws Exception {
  var selected=msg(5,cutoff,false);var other=msg(6,cutoff,false);when(other.isSet(Flags.Flag.DELETED)).thenReturn(true);
  assertThat(service.cleanup(user,box.getId(),List.of("5"),true).deleted()).isEqualTo(1);
  verify(folder).expunge(new Message[]{selected});verify(folder,never()).expunge();verify(other,never()).setFlag(any(),anyBoolean());
 }
 @Test void criticalOrHiddenUidRejectsEntireBatchBeforeAnyFlag()throws Exception {
  var safe=msg(2,cutoff,false);var critical=msg(3,cutoff,true);var old=msg(1,cutoff.minusSeconds(1),false);
  assertThatThrownBy(()->service.cleanup(user,box.getId(),List.of("2","3"),true)).hasMessageContaining("protected");
  assertThatThrownBy(()->service.cleanup(user,box.getId(),List.of("2","1"),true)).isInstanceOf(MessageNotFoundException.class);
  verify(safe,never()).setFlag(any(),anyBoolean());verify(folder,never()).expunge(any(Message[].class));
 }
 @Test void noUidPlusFailsBeforeWritingDeletedFlags()throws Exception {
  when(store.hasCapability("UIDPLUS")).thenReturn(false);
  assertThatThrownBy(()->service.cleanup(user,box.getId(),List.of("2"),true)).hasMessageContaining("exact-message");
  verify(folder,never()).open(anyInt());
 }
 @Test void alternateNumericSpellingCannotSelectTheSameUidTwice()throws Exception {
  msg(5,cutoff,false);
  assertThatThrownBy(()->service.cleanup(user,box.getId(),List.of("5","05"),true))
    .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("distinct");
  verify(folder,never()).open(anyInt());
 }

 @Test void unreadableKnownSecurityMailCannotBeDeletedAsIfItWereNoncritical()throws Exception {
  var critical=msg(5,cutoff,true);when(critical.getContent()).thenThrow(new IOException("temporary MIME read failure"));
  assertThatThrownBy(()->service.cleanup(user,box.getId(),List.of("5"),true)).hasMessageContaining("protected");
  verify(critical,never()).setFlag(any(),anyBoolean());verify(folder,never()).expunge(any(Message[].class));
 }

}
