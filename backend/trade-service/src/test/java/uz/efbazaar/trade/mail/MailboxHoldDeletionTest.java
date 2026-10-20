package uz.efbazaar.trade.mail;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.trade.mailbox.service.MailboxPreservationService;
import uz.efbazaar.trade.common.exception.ApiCodeException;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.*;
class MailboxHoldDeletionTest {
 @Test void holdCannotClaimProtectionAfterDeletionAlreadyStartedOrFinished() {
  for(String status:List.of("PENDING","FAILED","CONFIRMED","DELETED")) {
   UUID box=UUID.randomUUID();var jdbc=mock(JdbcTemplate.class);
   when(jdbc.queryForList(anyString(),eq(UUID.class),eq(box))).thenReturn(List.of(box));
   var row=new HashMap<String,Object>();row.put("id",box);row.put("deletion_status",status.equals("DELETED")?"NONE":status);
   row.put("deleted_at",status.equals("DELETED")?java.sql.Timestamp.from(Instant.EPOCH):null);
   when(jdbc.queryForMap(anyString(),eq(box))).thenReturn(row);
   var service=new MailboxPreservationService(jdbc,Clock.fixed(Instant.EPOCH,ZoneOffset.UTC));
   assertThatThrownBy(()->service.setHold(UUID.randomUUID(),box,"Dispute evidence"))
     .as("cannot promise preservation when deletion is "+status).isInstanceOf(ApiCodeException.class)
     .hasMessageContaining("deletion");
   verify(jdbc,never()).update(startsWith("UPDATE mailboxes"),any(Object[].class));
  }
 }
}
