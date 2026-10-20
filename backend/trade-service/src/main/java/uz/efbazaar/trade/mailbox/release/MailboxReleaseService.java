package uz.efbazaar.trade.mailbox.release;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import uz.efbazaar.trade.common.exception.ApiCodeException;
import uz.efbazaar.trade.kafka.*;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mail.service.MailboxPasswordResolver;
import uz.efbazaar.trade.mailbox.service.MailboxPreservationService;
import uz.efbazaar.trade.plan.service.MailboxQuotaLock;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;

/** A local unlink is never proof that an external account left the mailbox. */
@Service
@RequiredArgsConstructor
public class MailboxReleaseService {
 private final JdbcTemplate jdbc;
 private final MailboxQuotaLock quota;
 private final MailboxDeletionService deletions;
 private final MailboxPreservationService preservation;
 private final MailboxRepository mailboxes;
 private final MailboxPasswordResolver passwords;
 private final TradeEventPublisher events;
 private final Clock clock;
 public record Check(UUID requestId,String status,Instant startedAt,Instant expiresAt,String error) {}

 @Transactional public Check start(UUID user,UUID id) {
  quota.lock(user); var box=owned(user,id,true);
  preservation.assertNotProtected(id);
  if(box.deleted() || box.provisioned()==null || !java.util.Set.of("NONE","FAILED").contains(box.deletionStatus())) conflict("Quti o‘chirish jarayonida yoki hali yaratilmagan");
  if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM mailbox_link_sessions WHERE mailbox_id=? "
       +"AND state IN ('WAIT_EMAIL_CHANGE','WAIT_RESET'))",Boolean.class,id))) conflict("Bog‘lash jarayonini tugating");
  Instant now=clock.instant(); UUID req=UUID.randomUUID();
  jdbc.update("UPDATE mailbox_release_checks SET status='EXPIRED' WHERE mailbox_id=? AND status IN ('PENDING','VERIFIED')",id);
  jdbc.update("INSERT INTO mailbox_release_checks(id,mailbox_id,user_id,email,expected_owner,expected_retained,"
    +"expected_provisioned_at,started_at,expires_at,status) VALUES (?,?,?,?,?,?,?,?,?,'PENDING')",
    req,id,user,box.email(),box.owner(),box.retained(),Timestamp.from(box.provisioned()),Timestamp.from(now),Timestamp.from(now.plusSeconds(600)));
  var mb=mailboxes.findById(id).orElseThrow();
  var creds=passwords.contextFor(mb).map(ctx->new TradeEvents.PollCredentials(ctx,mb.getEncryptedPassword(),mb.getPasswordIv(),mb.getPasswordTag())).orElse(null);
  events.imapPollRequest(req,box.email(),TradeEvents.ImapPurpose.VERIFY_RELEASE,true,creds,now,now.plusSeconds(600));
  return new Check(req,"PENDING",now,now.plusSeconds(600),null);
 }

 @Transactional public Check status(UUID user,UUID box,UUID req) {
  owned(user,box,false);
  expire(req);
  var rows=jdbc.query("SELECT * FROM mailbox_release_checks WHERE id=? AND user_id=? AND mailbox_id=?",
   (rs,n)->new Check(rs.getObject("id",UUID.class),rs.getString("status"),rs.getTimestamp("started_at").toInstant(),
    rs.getTimestamp("expires_at").toInstant(),rs.getString("error")),req,user,box);
  if(rows.isEmpty()) notFound(); return rows.getFirst();
 }

 @Transactional public boolean onProof(TradeEvents.KonamiEmailReceived e) {
  if(e.tradeId()==null) return false;
  var rows=jdbc.queryForList("SELECT * FROM mailbox_release_checks WHERE id=?",e.tradeId());
  if(rows.isEmpty()) return false;
  var row=rows.getFirst(); UUID user=(UUID)row.get("user_id"),id=(UUID)row.get("mailbox_id");
  quota.lock(user); var box=deletions.find(id,true);
  row=jdbc.queryForMap("SELECT * FROM mailbox_release_checks WHERE id=? FOR UPDATE",e.tradeId());
  expire(e.tradeId());
  // Consume every release-correlated event so it cannot fall through into another workflow.
  if(!"PENDING".equals(row.get("status")) || !clock.instant().isBefore(((Timestamp)row.get("expires_at")).toInstant())
    || e.receivedAt()==null || e.receivedAt().isBefore(((Timestamp)row.get("started_at")).toInstant())
    || e.receivedAt().isAfter(clock.instant().plusSeconds(30)) || !Objects.equals(e.mailboxEmail(),box.email())
    || !sameSnapshot(box,row) || box.deleted() || !java.util.Set.of("NONE","FAILED").contains(box.deletionStatus())) return true;
  if(!Boolean.TRUE.equals(e.originVerified())) {
    jdbc.update("UPDATE mailbox_release_checks SET error='Konami message signature and freshness are not verified' "
      +"WHERE id=? AND status='PENDING'",e.tradeId());
    return true;
  }
  if(preservation.isProtected(id)) {
    jdbc.update("UPDATE mailbox_release_checks SET status='FAILED',error='Mailbox preservation or trade changed' WHERE id=?",e.tradeId());
    // Another workflow may now own the watcher; do not stop it by address.
    return true;
  }
  if(e.emailNotRegistered() && !e.resetLinkPresent()) {
    jdbc.update("UPDATE mailbox_release_checks SET status='VERIFIED',error=NULL,verified_at=? WHERE id=? AND status='PENDING'",
      Timestamp.from(clock.instant()),e.tradeId());
    events.imapPollStopRequest(box.email());
  } else if(e.resetLinkPresent()) {
    jdbc.update("UPDATE mailbox_release_checks SET status='FAILED',error='Konami account still uses this email' WHERE id=?",e.tradeId());
    events.imapPollStopRequest(box.email());
  }
  return true;
 }

 @Transactional public MailboxDeletionService.Result release(UUID user,UUID id,UUID req,boolean confirm) {
  quota.lock(user); var box=owned(user,id,true);
  if(box.deletionRequest()!=null && !"FAILED".equals(box.deletionStatus())) return deletions.result(box.deletionRequest());
  if("FAILED".equals(box.deletionStatus()) && Objects.equals(req,box.deletionRequest()))
    conflict("Qayta urinish uchun yangi Konami tasdig‘i kerak");
  if(!confirm || req==null) conflict("Eksport va qaytarib bo‘lmas o‘chirishni tasdiqlang");
  var check=status(user,id,req);
  if(!"VERIFIED".equals(check.status())) conflict("Konami email ko‘chirilgani yangi xat bilan tasdiqlanmagan");
  var row=jdbc.queryForMap("SELECT * FROM mailbox_release_checks WHERE id=?",req);
  if(!sameSnapshot(box,row)) conflict("Quti egasi yoki rekvizitlari o‘zgargan");
  preservation.assertNotProtected(id);
  return deletions.queue(box,req);
 }

 private MailboxDeletionService.Box owned(UUID user,UUID id,boolean lock) {
  var box=deletions.find(id,lock);
  if(!user.equals(box.owner()) && !user.equals(box.retained())) notFound();
  return box;
 }
 private void expire(UUID req) {jdbc.update("UPDATE mailbox_release_checks SET status='EXPIRED' WHERE id=? "
    +"AND status IN ('PENDING','VERIFIED') AND expires_at<=?",req,Timestamp.from(clock.instant()));}
 private boolean sameSnapshot(MailboxDeletionService.Box box,Map<String,Object> row) {
  return Objects.equals(box.owner(),row.get("expected_owner")) && Objects.equals(box.retained(),row.get("expected_retained"))
   && Objects.equals(box.provisioned(),row.get("expected_provisioned_at")==null?null:((Timestamp)row.get("expected_provisioned_at")).toInstant())
   && Objects.equals(box.email(),row.get("email"));
 }
 private static void conflict(String text){throw new ApiCodeException(HttpStatus.CONFLICT,"mailbox_release_unverified",text);}
 private static void notFound(){throw new ApiCodeException(HttpStatus.NOT_FOUND,"mailbox_not_found","Pochta topilmadi");}
}
