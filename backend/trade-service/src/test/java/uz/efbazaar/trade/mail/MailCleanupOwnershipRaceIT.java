package uz.efbazaar.trade.mail;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.testsupport.AbstractMailboxFeatureIT;
import uz.efbazaar.trade.mail.service.MailService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import java.util.*;
import java.util.concurrent.Executors;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class MailCleanupOwnershipRaceIT extends AbstractMailboxFeatureIT {
 @Autowired MailService mail;
 @Autowired MailboxRepository boxes;
 @Autowired JdbcTemplate jdbc;
 @SpyBean MailboxService ownership;
 @Test void ownershipTransferAfterInitialAuthorizationPreventsDestructiveImapAccess() throws Exception {
  UUID user=UUID.randomUUID(),buyer=UUID.randomUUID(),box=UUID.randomUUID();
  boxes.saveAndFlush(Mailbox.builder().id(box).email("cleanup-race-"+box+"@efbazaar.uz").ownerUserId(user)
   .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16]).build());
  try(var transfer=Executors.newSingleThreadExecutor()) {
   doAnswer(call->{
    Mailbox snapshot=(Mailbox)call.callRealMethod();
    transfer.submit(()->jdbc.update("UPDATE mailboxes SET owner_user_id=?,owner_mail_visible_from=now() WHERE id=?",buyer,box)).get();
    return snapshot;
   }).when(ownership).getOwned(user,box);
   try {
    assertThatThrownBy(()->mail.cleanup(user,box,List.of("1"),true))
      .isInstanceOfSatisfying(jakarta.persistence.EntityNotFoundException.class,e->assertThat(e.getMessage()).contains("Mailbox"));
    assertThat(boxes.findById(box).orElseThrow().getOwnerUserId()).isEqualTo(buyer);
   } finally { reset(ownership); }
  }
 }
}
