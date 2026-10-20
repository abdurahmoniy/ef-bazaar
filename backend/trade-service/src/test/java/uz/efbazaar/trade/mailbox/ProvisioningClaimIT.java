package uz.efbazaar.trade.mailbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mailbox.domain.*;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.testsupport.*;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest @AutoConfigureMockMvc @Import(StubEscrowConfig.class)
class ProvisioningClaimIT extends AbstractIntegrationIT {
 @Autowired MockMvc mvc; @Autowired MailboxRepository boxes; @Autowired JdbcTemplate jdbc; @Autowired ObjectMapper mapper;
 private Mailbox custom() {
  UUID id=UUID.randomUUID();return boxes.saveAndFlush(Mailbox.builder().id(id).email("claim-"+id+"@efbazaar.uz")
   .ownerUserId(UUID.randomUUID()).source(MailboxSource.USER).kind(MailboxKind.CUSTOM)
   .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16]).build());
 }
 private String payload(String email,UUID trade,int version,byte password)throws Exception {
  var data=new HashMap<String,Object>();data.put("mailboxEmail",email);data.put("tradeId",trade);data.put("addressVersion",version);
  data.put("encryptedPassword",Base64.getEncoder().encodeToString(new byte[]{password}));
  data.put("iv",Base64.getEncoder().encodeToString(new byte[12]));data.put("tag",Base64.getEncoder().encodeToString(new byte[16]));
  return mapper.writeValueAsString(data);
 }
 private org.springframework.test.web.servlet.ResultActions claim(Mailbox box,String body)throws Exception {
  return mvc.perform(post("/internal/mailboxes/{id}/provision-claim",box.getId()).header("X-Internal-Secret","test-internal-secret")
    .contentType(MediaType.APPLICATION_JSON).content(body));
 }
 @Test void internalSecretIsRequiredAndOnlyTheFirstClaimCanCreate()throws Exception {
  var box=custom();String first=payload(box.getEmail(),null,2,(byte)7);
  mvc.perform(post("/internal/mailboxes/{id}/provision-claim",box.getId()).contentType(MediaType.APPLICATION_JSON).content(first))
    .andExpect(status().isForbidden());
  var response=claim(box,first).andExpect(status().isOk()).andExpect(jsonPath("$.allowCreate").value(true))
    .andExpect(jsonPath("$.encryptedPassword").value("Bw==")).andReturn().getResponse().getContentAsString();
  String id=mapper.readTree(response).path("claimId").asText();assertThat(id).isNotBlank();
  claim(box,payload(box.getEmail(),null,2,(byte)9)).andExpect(status().isOk())
   .andExpect(jsonPath("$.allowCreate").value(false)).andExpect(jsonPath("$.claimId").value(id))
   .andExpect(jsonPath("$.encryptedPassword").value("Bw=="));
 }
 @Test void legacyWrongAddressAndConfirmedResourcesCannotAuthorizeCreation()throws Exception {
  var box=custom();claim(box,payload(box.getEmail(),null,1,(byte)7)).andExpect(status().isConflict());
  claim(box,payload("other@efbazaar.uz",null,2,(byte)7)).andExpect(status().isConflict());
  jdbc.update("UPDATE mailboxes SET provisioned_at=? WHERE id=?",java.sql.Timestamp.from(Instant.now()),box.getId());
  claim(box,payload(box.getEmail(),null,2,(byte)7)).andExpect(status().isConflict());
 }
 @Test void startedClaimsFreezeIdentityAndBlockDeletion()throws Exception {
  var box=custom();claim(box,payload(box.getEmail(),null,2,(byte)7)).andExpect(status().isOk());
  assertThatThrownBy(()->jdbc.update("UPDATE mailboxes SET owner_user_id=? WHERE id=?",UUID.randomUUID(),box.getId()))
   .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
  mvc.perform(post("/api/v1/mailboxes/{id}/release-check",box.getId())
     .with(AuthHeaderRequestPostProcessor.asUser(box.getOwnerUserId())))
   .andExpect(status().isConflict());
 }
 @Autowired uz.efbazaar.trade.kafka.MailboxProvisionedConsumer provisioned;
 @Autowired uz.efbazaar.trade.kafka.EmailProvisionedConsumer tradeProvisioned;
 @Autowired uz.efbazaar.trade.trade.repository.TradeRepository tradeRows;
 @Autowired uz.efbazaar.trade.trade.service.TradeService trades;
 @Autowired uz.efbazaar.trade.plan.service.MailboxSlotService slots;

 @Test void onlyTheCorrelatedImmutableSuccessResolvesAClaimAndReplayPreservesRotation()throws Exception {
  var box=custom();var response=claim(box,payload(box.getEmail(),null,2,(byte)7)).andExpect(status().isOk())
   .andReturn().getResponse().getContentAsString();UUID claim=UUID.fromString(mapper.readTree(response).path("claimId").asText());
  provisioned.onMailboxProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.MailboxProvisioned(box.getId(),box.getEmail(),new byte[]{7},new byte[12],new byte[16],null));
  provisioned.onMailboxProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.MailboxProvisioned(box.getId(),box.getEmail(),new byte[]{7},new byte[12],new byte[16],UUID.randomUUID()));
  provisioned.onMailboxProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.MailboxProvisioned(box.getId(),box.getEmail(),new byte[]{9},new byte[12],new byte[16],claim));
  assertThat(boxes.findById(box.getId()).orElseThrow().getProvisionedAt()).isNull();
  var success=new uz.efbazaar.trade.kafka.TradeEvents.MailboxProvisioned(box.getId(),box.getEmail(),new byte[]{7},new byte[12],new byte[16],claim);
  provisioned.onMailboxProvisioned(success);
  assertThat(boxes.findById(box.getId()).orElseThrow().getProvisioningStatus()).isEqualTo("CONFIRMED");
  jdbc.update("UPDATE mailboxes SET encrypted_password=? WHERE id=?",new byte[]{11},box.getId());
  provisioned.onMailboxProvisioned(success);
  assertThat(boxes.findById(box.getId()).orElseThrow().getEncryptedPassword()).containsExactly(11);
  claim(box,payload(box.getEmail(),null,2,(byte)9)).andExpect(status().isConflict());
 }

 @Test void unknownRandomCreationRemainsChargedAfterTerminalFailureAndLateSuccessDoesNotReviveTrade()throws Exception {
  UUID user=UUID.randomUUID(),buyer=UUID.randomUUID(),trade=UUID.randomUUID(),id=UUID.randomUUID();
  var box=boxes.saveAndFlush(Mailbox.builder().id(id).email("pending-"+id+"@invalid.test")
   .encryptedPassword(new byte[]{1}).passwordIv(new byte[12]).passwordTag(new byte[16]).build());
  tradeRows.saveAndFlush(uz.efbazaar.trade.trade.domain.Trade.builder().id(trade).sellerId(user).buyerId(buyer)
   .mailboxId(id).priceUzs(1).state(uz.efbazaar.trade.trade.domain.TradeState.INITIATED)
   .expiresAt(Instant.now().plusSeconds(600)).build());
  String address="trade-"+id.toString().replace("-","")+"@efbazaar.uz";
  claim(box,payload(address,UUID.randomUUID(),2,(byte)7)).andExpect(status().isConflict());
  claim(box,payload("trade-"+id.toString().substring(0,8)+"@efbazaar.uz",trade,2,(byte)7)).andExpect(status().isConflict());
  var response=claim(box,payload(address,trade,2,(byte)7)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
  UUID claim=UUID.fromString(mapper.readTree(response).path("claimId").asText());
  trades.transition(trade,uz.efbazaar.trade.trade.domain.TradeEvent.PROVISION_FAILED,uz.efbazaar.trade.trade.domain.ActorType.WORKER,null);
  assertThat(tradeRows.findById(trade).orElseThrow().getState()).isEqualTo(uz.efbazaar.trade.trade.domain.TradeState.ORPHANED);
  assertThat(slots.used(user)).isEqualTo(1);
  assertThat(boxes.findById(id).orElseThrow().getDeletedAt()).isNull();
  claim(box,payload(address,trade,2,(byte)9)).andExpect(status().isOk()).andExpect(jsonPath("$.allowCreate").value(false));
  tradeProvisioned.onEmailProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.EmailProvisioned(trade,id,address,new byte[]{7},new byte[12],new byte[16],claim));
  var after=boxes.findById(id).orElseThrow();assertThat(after.getProvisionedAt()).isNotNull();
  assertThat(after.getOwnerUserId()).isNull();assertThat(after.getRetainedUserId()).isEqualTo(user);assertThat(slots.used(user)).isEqualTo(1);
  assertThat(tradeRows.findById(trade).orElseThrow().getState()).isEqualTo(uz.efbazaar.trade.trade.domain.TradeState.ORPHANED);
 }

 @Test void legacyCustomResultMustMatchReservedAddressAndUpdatesOnlyInitialCredentials()throws Exception {
  var box=custom();
  provisioned.onMailboxProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.MailboxProvisioned(box.getId(),"other@efbazaar.uz",new byte[]{7},new byte[12],new byte[16]));
  assertThat(boxes.findById(box.getId()).orElseThrow().getEmail()).isEqualTo(box.getEmail());
  assertThat(boxes.findById(box.getId()).orElseThrow().getProvisionedAt()).isNull();
  provisioned.onMailboxProvisioned(new uz.efbazaar.trade.kafka.TradeEvents.MailboxProvisioned(box.getId(),box.getEmail(),new byte[]{7},new byte[12],new byte[16]));
  assertThat(boxes.findById(box.getId()).orElseThrow().getProvisioningStatus()).isEqualTo("CONFIRMED");
 }

 @Test void concurrentWorkersReceiveExactlyOneExternalCreatePermission()throws Exception {
  var box=custom();var gate=new java.util.concurrent.CountDownLatch(1);
  try(var workers=java.util.concurrent.Executors.newFixedThreadPool(2)) {
   var results=new ArrayList<java.util.concurrent.Future<com.fasterxml.jackson.databind.JsonNode>>();
   for(byte secret:new byte[]{7,9})results.add(workers.submit(()->{
    gate.await();return mapper.readTree(claim(box,payload(box.getEmail(),null,2,secret)).andExpect(status().isOk())
      .andReturn().getResponse().getContentAsString());
   }));
   gate.countDown();var outcomes=new ArrayList<com.fasterxml.jackson.databind.JsonNode>();
   for(var future:results)outcomes.add(future.get(10,java.util.concurrent.TimeUnit.SECONDS));
   assertThat(outcomes.stream().filter(node->node.path("allowCreate").asBoolean()).count()).isEqualTo(1);
   assertThat(outcomes).extracting(node->node.path("claimId").asText()).containsOnly(outcomes.getFirst().path("claimId").asText());
   assertThat(outcomes).extracting(node->node.path("encryptedPassword").asText()).containsOnly(outcomes.getFirst().path("encryptedPassword").asText());
  }
 }

}
