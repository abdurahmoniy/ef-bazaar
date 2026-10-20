package uz.efbazaar.trade.mailbox;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import com.fasterxml.jackson.databind.ObjectMapper;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.kafka.*;
import java.time.Instant;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

class MailboxReleaseIT extends uz.efbazaar.trade.testsupport.AbstractMailboxFeatureIT {
 @Autowired MockMvc mvc;
 @Autowired MailboxRepository mailboxes;
 @Autowired JdbcTemplate jdbc;
 @Autowired ObjectMapper json;
 @Autowired KonamiEmailReceivedConsumer proof;
 @Autowired uz.efbazaar.trade.mailbox.release.MailboxDeletionService deletions;
 @Autowired uz.efbazaar.trade.plan.service.MailboxSlotService slots;
 UUID mailbox(UUID user) {
  UUID id=UUID.randomUUID();
  mailboxes.saveAndFlush(Mailbox.builder().id(id).ownerUserId(user).email("release-"+id+"@efbazaar.uz")
   .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16])
   .provisionedAt(Instant.now()).build()); return id;
 }
 String path(UUID id) { return "/api/v1/mailboxes/"+id; }
 UUID check(UUID user,UUID box) throws Exception {
  var result=mvc.perform(post(path(box)+"/release-check").with(asUser(user)))
   .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"))
   .andReturn().getResponse().getContentAsString();
  return UUID.fromString(json.readTree(result).get("requestId").asText());
 }
 @Test void unlinkOrCheckboxCannotReleaseAndAnotherOwnerCannotCheck() throws Exception {
  UUID user=UUID.randomUUID(),box=mailbox(user);
  mvc.perform(post(path(box)+"/release-check").with(asUser(UUID.randomUUID())))
   .andExpect(status().isNotFound());
  UUID req=check(user,box);
  mvc.perform(post(path(box)+"/release").with(asUser(user)).contentType("application/json")
   .content("{\"requestId\":\""+req+"\",\"confirmDelete\":true}"))
   .andExpect(status().isConflict());
  assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNull();
 }
 @Test void onlyFreshCorrelatedNegativeMailVerifiesAndQueueDoesNotFreeQuota() throws Exception {
  UUID user=UUID.randomUUID(),box=mailbox(user), req=check(user,box);
  String email=mailboxes.findById(box).orElseThrow().getEmail();
  proof.onKonamiEmail(new TradeEvents.KonamiEmailReceived(req,false,"konami-info@account.konami.net",Instant.now().minusSeconds(60),email,true,true));
  mvc.perform(get(path(box)+"/release-check/"+req).with(asUser(user)))
   .andExpect(jsonPath("$.status").value("PENDING"));
  proof.onKonamiEmail(new TradeEvents.KonamiEmailReceived(req,false,"konami-info@account.konami.net",Instant.now(),email,true,true));
  mvc.perform(get(path(box)+"/release-check/"+req).with(asUser(user)))
   .andExpect(jsonPath("$.status").value("VERIFIED"));
  mvc.perform(post(path(box)+"/release").with(asUser(user)).contentType("application/json")
   .content("{\"requestId\":\""+req+"\",\"confirmDelete\":true}"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
  assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNull();
  assertThat(mailboxes.findById(box).orElseThrow().getOwnerUserId()).isEqualTo(user);
  assertThat(jdbc.queryForObject("SELECT deletion_status FROM mailboxes WHERE id=?",String.class,box)).isEqualTo("PENDING");
 }

 UUID verified(UUID user,UUID box) throws Exception {
  UUID req=check(user,box); String email=mailboxes.findById(box).orElseThrow().getEmail();
  proof.onKonamiEmail(new TradeEvents.KonamiEmailReceived(req,false,"konami-info@konami.net",Instant.now(),email,true,true));
  return req;
 }
 void queue(UUID user,UUID box,UUID req) throws Exception {
  mvc.perform(post(path(box)+"/release").with(asUser(user)).contentType("application/json")
    .content("{\"requestId\":\""+req+"\",\"confirmDelete\":true}"))
    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
 }
 @Test void failedDeleteAndWrongNonceRetainQuotaUntilConfirmedAckAndAddressTombstone() throws Exception {
  UUID user=UUID.randomUUID(),box=mailbox(user),req=verified(user,box);
  String email=mailboxes.findById(box).orElseThrow().getEmail();
  queue(user,box,req);
  assertThat(slots.used(user)).isEqualTo(1);
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    UUID.randomUUID(),box,email,true,false,null,Instant.now()));
  assertThat(slots.used(user)).isEqualTo(1);
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    req,box,email,false,false,"access_denied",Instant.now()));
  assertThat(slots.used(user)).isEqualTo(1);
  assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNull();
  assertThat(deletions.result(req).status()).isEqualTo("FAILED");
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    req,box,email,true,true,null,Instant.now()));
  assertThat(slots.used(user)).isZero();
  assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNotNull();
  assertThat(mailboxes.existsByEmail(email)).isTrue();
  // A duplicate failure cannot undo a confirmed deletion.
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    req,box,email,false,false,"late",Instant.now()));
  assertThat(deletions.result(req).status()).isEqualTo("CONFIRMED");
 }
 @Test void staleProofChangedOwnerAndPreservationHoldCannotAuthorizeDeletion() throws Exception {
  UUID user=UUID.randomUUID(),box=mailbox(user),req=verified(user,box);
  jdbc.update("UPDATE mailbox_release_checks SET expires_at=now()-interval '1 second' WHERE id=?",req);
  mvc.perform(post(path(box)+"/release").with(asUser(user)).contentType("application/json")
    .content("{\"requestId\":\""+req+"\",\"confirmDelete\":true}"))
    .andExpect(status().isConflict());
  UUID fresh=verified(user,box);
  jdbc.update("UPDATE mailboxes SET preservation_hold_reason='DISPUTE' WHERE id=?",box);
  mvc.perform(post(path(box)+"/release").with(asUser(user)).contentType("application/json")
    .content("{\"requestId\":\""+fresh+"\",\"confirmDelete\":true}"))
    .andExpect(status().isConflict());
  assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNull();
 }
 @Test void neverProvisionedAdminPlaceholderDoesNotRequestExternalDeletion() {
  UUID box=mailbox(null);
  String synthetic="pending-"+UUID.randomUUID()+"@efbazaar.uz";
  jdbc.update("UPDATE mailboxes SET email=?,provisioned_at=NULL,encrypted_password=decode('00','hex') WHERE id=?",synthetic,box);
  deletions.requestUnheld(box,synthetic,null);
  assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNotNull();
  assertThat(jdbc.queryForObject("SELECT count(*) FROM mailbox_deletion_requests WHERE mailbox_id=?",Integer.class,box)).isZero();
 }
 @Test void failedDeleteCanBeRetriedOnlyWithNewFreshProof() throws Exception {
  UUID user=UUID.randomUUID(),box=mailbox(user),req=verified(user,box);
  String email=mailboxes.findById(box).orElseThrow().getEmail(); queue(user,box,req);
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    req,box,email,false,false,"temporary Mailcow error",Instant.now()));
  UUID fresh=verified(user,box); queue(user,box,fresh);
  assertThat(fresh).isNotEqualTo(req);
  assertThat(jdbc.queryForObject("SELECT deletion_request_id FROM mailboxes WHERE id=?",UUID.class,box)).isEqualTo(fresh);
  assertThat(slots.used(user)).isEqualTo(1);
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    req,box,email,true,true,null,Instant.now()));
  assertThat(slots.used(user)).isEqualTo(1);
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    fresh,box,email,true,true,null,Instant.now()));
  assertThat(slots.used(user)).isZero();
 }
 @Test void confirmedAddressCannotBeRenamedOrHardDeletedToMakeItReusable() throws Exception {
  UUID user=UUID.randomUUID(),box=mailbox(user),req=verified(user,box);
  String email=mailboxes.findById(box).orElseThrow().getEmail(); queue(user,box,req);
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    req,box,email,true,false,null,Instant.now()));
  assertThatThrownBy(()->jdbc.update("UPDATE mailboxes SET email=? WHERE id=?","renamed-"+email,box))
    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  assertThatThrownBy(()->jdbc.update("DELETE FROM mailboxes WHERE id=?",box))
    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  assertThat(mailboxes.existsByEmail(email)).isTrue();
 }
 @Test void preservationAddedAfterCheckPreventsProofFromAuthorizingDestruction() throws Exception {
  UUID user=UUID.randomUUID(),box=mailbox(user),req=check(user,box);
  jdbc.update("UPDATE mailboxes SET preservation_hold_reason='NEW_DISPUTE' WHERE id=?",box);
  proof.onKonamiEmail(new TradeEvents.KonamiEmailReceived(req,false,"konami-info@konami.net",Instant.now(),
    mailboxes.findById(box).orElseThrow().getEmail(),true,true));
  mvc.perform(get(path(box)+"/release-check/"+req).with(asUser(user)))
    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("FAILED"));
 }
 @Test void missingProvisionAcknowledgementIsNotProofOfServerAbsence() {
  UUID box=mailbox(null);
  jdbc.update("UPDATE mailboxes SET provisioned_at=NULL WHERE id=?",box);
  String email=mailboxes.findById(box).orElseThrow().getEmail();
  deletions.requestUnheld(box,email,null);
  assertThat(mailboxes.findById(box).orElseThrow().getDeletedAt()).isNull();
  assertThat(jdbc.queryForObject("SELECT deletion_status FROM mailboxes WHERE id=?",String.class,box)).isEqualTo("PENDING");
 }
 @Test void unverifiedNegativeMailCannotAuthorizeReleaseEvenWithFreshMatchingNonce() throws Exception {
  UUID user=UUID.randomUUID(),box=mailbox(user),req=check(user,box);
  proof.onKonamiEmail(new TradeEvents.KonamiEmailReceived(req,false,"konami-info@konami.net",Instant.now(),
    mailboxes.findById(box).orElseThrow().getEmail(),true));
  mvc.perform(get(path(box)+"/release-check/"+req).with(asUser(user)))
    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
 }
 @Autowired uz.efbazaar.trade.mailbox.provision.ProvisioningClaimService provisioning;
 private UUID confirmedUnknownProvisioning() {
  UUID box=mailbox(null);
  jdbc.update("UPDATE mailboxes SET provisioned_at=NULL WHERE id=?",box);
  String email=mailboxes.findById(box).orElseThrow().getEmail();
  deletions.requestUnheld(box,email,null);
  UUID request=jdbc.queryForObject("SELECT deletion_request_id FROM mailboxes WHERE id=?",UUID.class,box);
  deletions.acknowledge(new uz.efbazaar.trade.mailbox.release.MailboxDeletionService.Ack(
    request,box,email,true,true,null,Instant.now()));
  assertThat(jdbc.queryForObject("SELECT deletion_status FROM mailboxes WHERE id=?",String.class,box)).isEqualTo("CONFIRMED");
  return box;
 }
 @Test void confirmedRealAddressWithMissingProvisionAckRejectsLegacyCompletion() {
  UUID box=confirmedUnknownProvisioning();
  assertThat(provisioning.complete(box,UUID.randomUUID(),"renamed-"+box+"@efbazaar.uz",
    new byte[]{2},new byte[12],new byte[16],null))
    .isEqualTo(uz.efbazaar.trade.mailbox.provision.ProvisioningClaimService.Completion.REJECTED);
 }
 @Test void confirmedRealAddressWithMissingProvisionAckIsAPermanentTombstone() {
  UUID box=confirmedUnknownProvisioning();
  String email=mailboxes.findById(box).orElseThrow().getEmail();
  assertThatThrownBy(()->jdbc.update("UPDATE mailboxes SET email=? WHERE id=?","renamed-"+email,box))
    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  assertThatThrownBy(()->jdbc.update("DELETE FROM mailboxes WHERE id=?",box))
    .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  assertThat(mailboxes.existsByEmail(email)).isTrue();
 }

}
