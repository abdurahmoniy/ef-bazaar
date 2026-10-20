package uz.efbazaar.trade.mail;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mail.service.ImapConnectionPool;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.*;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;
@SpringBootTest @AutoConfigureMockMvc @Import(StubEscrowConfig.class)
class MailPortabilityIT extends AbstractIntegrationIT {
 @Autowired MockMvc mvc; @Autowired MailboxRepository boxes; @MockBean ImapConnectionPool pool;
 private Mailbox owned(UUID user) {
  UUID id=UUID.randomUUID();return boxes.saveAndFlush(Mailbox.builder().id(id).email("export-"+id+"@efbazaar.uz")
   .ownerUserId(user).encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16]).build());
 }
 @Test void explicitCleanupRequiresConfirmationAndBoundedNonemptySelection() throws Exception {
  UUID owner=UUID.randomUUID();var box=owned(owner);
  for(String body:java.util.List.of("{\"messageIds\":[\"1\"],\"confirmDelete\":false}",
       "{\"messageIds\":[],\"confirmDelete\":true}","{\"messageIds\":[\"0\"],\"confirmDelete\":true}")) {
   mvc.perform(post("/api/v1/mail/{id}/cleanup",box.getId()).with(asUser(owner))
      .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
  }
  verifyNoInteractions(pool);
 }
 @Test void foreignOwnerCannotExportOrCleanupAnyUid() throws Exception {
   var box=owned(UUID.randomUUID()); UUID foreign=UUID.randomUUID();
   mvc.perform(get("/api/v1/mail/{id}/export",box.getId()).with(asUser(foreign))).andExpect(status().isNotFound());
   mvc.perform(post("/api/v1/mail/{id}/cleanup",box.getId()).with(asUser(foreign))
    .contentType(MediaType.APPLICATION_JSON).content("{\"messageIds\":[\"1\"],\"confirmDelete\":true}"))
    .andExpect(status().isNotFound());verifyNoInteractions(pool);
 }
 @Test void onlyAdminCanSetAnExplicitNonemptyPreservationHold() throws Exception {
  UUID owner=UUID.randomUUID();var box=owned(owner);
  mvc.perform(post("/api/v1/admin/mailboxes/{id}/preservation-hold",box.getId()).with(asUser(owner))
    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Dispute evidence\"}"))
    .andExpect(status().isForbidden());
  mvc.perform(post("/api/v1/admin/mailboxes/{id}/preservation-hold",box.getId())
    .with(uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin())
    .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Dispute evidence\"}"))
    .andExpect(status().isOk()).andExpect(jsonPath("$.holdReason").value("Dispute evidence"));
  mvc.perform(post("/api/v1/mail/{id}/cleanup",box.getId()).with(asUser(owner))
    .contentType(MediaType.APPLICATION_JSON).content("{\"messageIds\":[\"1\"],\"confirmDelete\":true}"))
    .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("mailbox_preserved"));
  verifyNoInteractions(pool);
 }

}
