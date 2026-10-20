package uz.efbazaar.trade.mailbox.provision;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import uz.efbazaar.trade.common.exception.ApiCodeException;
import uz.efbazaar.trade.plan.service.MailboxQuotaLock;
import uz.efbazaar.trade.mailbox.config.MailboxDomains;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** One external-create permission per permanent mailbox identity. STARTED is never automatically reset. */
@Service @RequiredArgsConstructor
public class ProvisioningClaimService {
 private final JdbcTemplate jdbc;
 private final MailboxQuotaLock quota;
 private final MailboxDomains domains;
 private final Clock clock;
 public record Request(UUID tradeId,String mailboxEmail,int addressVersion,byte[] encryptedPassword,byte[] iv,byte[] tag) {}
 public record Claim(UUID claimId,UUID mailboxId,String mailboxEmail,boolean allowCreate,byte[] encryptedPassword,byte[] iv,byte[] tag) {}
 public enum Completion { LEGACY, CLAIM_CONFIRMED, REPLAY, REJECTED }

 @Transactional public Claim claim(UUID id,Request request) {
  if(request.addressVersion()!=2 || request.mailboxEmail()==null || !request.mailboxEmail().equals(request.mailboxEmail().toLowerCase(Locale.ROOT)))
   conflict("Unsupported provisioning address identity");
  validateSeal(request.encryptedPassword(),request.iv(),request.tag());
  var before=box(id,false);var trade=trade(request.tradeId());
  quota.lock(user(before,"owner_user_id"),user(before,"retained_user_id"),user(trade,"seller_id"),user(trade,"buyer_id"));
  var row=box(id,true);
  if(!sameOwners(before,row)) conflict("Mailbox ownership changed; retry");
  if(row.get("deleted_at")!=null || !"NONE".equals(row.get("deletion_status")) || row.get("provisioned_at")!=null)
   conflict("Mailbox is deleted, being deleted, or already provisioned");
  UUID existing=user(row,"provisioning_claim_id");
  if(existing!=null) {
   var stored=jdbc.queryForMap("SELECT * FROM mailbox_provisioning_claims WHERE id=?",existing);
   if(!Objects.equals(request.mailboxEmail(),stored.get("email")) || !Objects.equals(request.tradeId(),stored.get("trade_id")))
    conflict("Provisioning claim identity does not match");
   if(!"STARTED".equals(row.get("provisioning_status"))) conflict("Provisioning outcome is not an unresolved claim");
   return claimResult(stored,false);
  }
  if(!"NONE".equals(row.get("provisioning_status"))) conflict("Provisioning state is not eligible for external creation");
  UUID responsible;
  if(request.tradeId()!=null) {
   trade=trade(request.tradeId());
   if(trade.isEmpty() || !"INITIATED".equals(trade.get("state")) || !"RANDOM".equals(row.get("kind")) || !"TRADE".equals(row.get("source")))
    conflict("No live random mailbox provisioning reservation");
   boolean main=id.equals(trade.get("mailbox_id"));
   var sides=jdbc.queryForList("SELECT role FROM trade_sides WHERE trade_id=? AND mailbox_id=?",String.class,request.tradeId(),id);
   if(!main && sides.isEmpty()) conflict("Mailbox does not belong to this trade");
   String expected="trade-"+id.toString().replace("-","")+"@"+domains.defaultDomain();
   if(!expected.equals(request.mailboxEmail())) conflict("Random mailbox must use its full UUID address");
   responsible=!sides.isEmpty() && "BUYER".equals(sides.getFirst()) ? user(trade,"buyer_id") : user(trade,"seller_id");
  } else {
   if(!java.util.Set.of("USER","ADMIN").contains(row.get("source")) || user(row,"owner_user_id")==null
      || !Objects.equals(row.get("email"),request.mailboxEmail())) conflict("No pending custom/admin mailbox provisioning reservation");
   int at=request.mailboxEmail().lastIndexOf('@');
   if(at<1 || !domains.allowed(request.mailboxEmail().substring(at+1))) conflict("Mailbox domain is not allowed");
   responsible=user(row,"owner_user_id");
  }
  if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM mailboxes WHERE lower(email)=lower(?) AND id<>?)",
    Boolean.class,request.mailboxEmail(),id))) conflict("Mailbox address is already permanently reserved");
  UUID claim=UUID.randomUUID();Instant now=clock.instant();
  jdbc.update("INSERT INTO mailbox_provisioning_claims(id,mailbox_id,email,trade_id,responsible_user_id,encrypted_password,iv,tag,started_at) VALUES (?,?,?,?,?,?,?,?,?)",
    claim,id,request.mailboxEmail(),request.tradeId(),responsible,request.encryptedPassword(),request.iv(),request.tag(),Timestamp.from(now));
  jdbc.update("UPDATE mailboxes SET email=?,encrypted_password=?,password_iv=?,password_tag=?,"
    +"retained_user_id=CASE WHEN owner_user_id IS NULL THEN COALESCE(retained_user_id,?) ELSE retained_user_id END,"
    +"provisioning_status='STARTED',provisioning_claim_id=?,provisioning_error=? WHERE id=?",
    request.mailboxEmail(),request.encryptedPassword(),request.iv(),request.tag(),responsible,claim,
    "UNKNOWN: external creation outcome is not confirmed; no automatic create retry",id);
  return new Claim(claim,id,request.mailboxEmail(),true,request.encryptedPassword(),request.iv(),request.tag());
 }

 /** Called inside the existing trade/quota transaction, or a short own transaction for custom/admin success. */
 @Transactional public Completion complete(UUID id,UUID tradeId,String email,byte[] password,byte[] iv,byte[] tag,UUID claimId) {
  var before=box(id,false);var trade=trade(tradeId);
  quota.lock(user(before,"owner_user_id"),user(before,"retained_user_id"),user(trade,"seller_id"),user(trade,"buyer_id"));
  var row=box(id,true);
  if(!sameOwners(before,row)) return Completion.REJECTED;
  UUID current=user(row,"provisioning_claim_id");
  if(current==null) {
   if(claimId!=null || (row.get("deleted_at")!=null && row.get("provisioned_at")!=null)
      || java.util.Set.of("PENDING","FAILED","CONFIRMED").contains(row.get("deletion_status"))
      || (tradeId==null && (!java.util.Set.of("USER","ADMIN").contains(row.get("source"))
          || !Objects.equals(email,row.get("email"))))) return Completion.REJECTED;
   return row.get("provisioned_at")==null ? Completion.LEGACY : Completion.REPLAY;
  }
  if(!current.equals(claimId)) return Completion.REJECTED;
  var stored=jdbc.queryForMap("SELECT * FROM mailbox_provisioning_claims WHERE id=? FOR UPDATE",current);
  if(!Objects.equals(tradeId,stored.get("trade_id")) || !Objects.equals(email,stored.get("email"))
    || !Arrays.equals(password,(byte[])stored.get("encrypted_password")) || !Arrays.equals(iv,(byte[])stored.get("iv"))
    || !Arrays.equals(tag,(byte[])stored.get("tag")) || row.get("deleted_at")!=null || !"NONE".equals(row.get("deletion_status"))) return Completion.REJECTED;
  if("CONFIRMED".equals(row.get("provisioning_status"))) return Completion.REPLAY;
  if(!"STARTED".equals(row.get("provisioning_status"))) return Completion.REJECTED;
  Instant now=clock.instant();
  jdbc.update("UPDATE mailboxes SET provisioning_status='CONFIRMED',provisioning_error=NULL,provisioned_at=? WHERE id=?",Timestamp.from(now),id);
  jdbc.update("UPDATE mailbox_provisioning_claims SET confirmed_at=? WHERE id=?",Timestamp.from(now),current);
  return Completion.CLAIM_CONFIRMED;
 }

 public boolean unresolved(UUID id) {
  return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM mailboxes WHERE id=? AND provisioning_status='STARTED')",Boolean.class,id));
 }
 public void assertNoUnresolvedClaim(UUID id) {if(unresolved(id)) conflict("Mailbox provisioning outcome is unresolved; preserve until credential proof or manual reconciliation");}
 private Map<String,Object> box(UUID id,boolean lock) {
  var rows=jdbc.queryForList("SELECT * FROM mailboxes WHERE id=?"+(lock?" FOR UPDATE":""),id);
  if(rows.isEmpty())throw new jakarta.persistence.EntityNotFoundException("Mailbox not found");return rows.getFirst();
 }
 private Map<String,Object> trade(UUID id) {
  if(id==null)return Map.of();var rows=jdbc.queryForList("SELECT * FROM trades WHERE id=?",id);return rows.isEmpty()?Map.of():rows.getFirst();
 }
 private static UUID user(Map<String,Object> row,String key){return (UUID)row.get(key);}
 private static boolean sameOwners(Map<String,Object>a,Map<String,Object>b){return Objects.equals(a.get("owner_user_id"),b.get("owner_user_id")) && Objects.equals(a.get("retained_user_id"),b.get("retained_user_id"));}
 private static Claim claimResult(Map<String,Object> row,boolean allow){return new Claim(user(row,"id"),user(row,"mailbox_id"),(String)row.get("email"),allow,(byte[])row.get("encrypted_password"),(byte[])row.get("iv"),(byte[])row.get("tag"));}
 private static void validateSeal(byte[] password,byte[] iv,byte[] tag){if(password==null || password.length==0 || password.length>4096 || iv==null || iv.length!=12 || tag==null || tag.length!=16)conflict("Invalid sealed mailbox credentials");}
 private static void conflict(String text){throw new ApiCodeException(HttpStatus.CONFLICT,"mailbox_provisioning_unresolved",text);}
}
