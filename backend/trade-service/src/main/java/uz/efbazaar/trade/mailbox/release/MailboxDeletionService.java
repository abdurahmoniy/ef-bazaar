package uz.efbazaar.trade.mailbox.release;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import uz.efbazaar.trade.common.exception.ApiCodeException;
import uz.efbazaar.trade.mailbox.service.MailboxPreservationService;
import uz.efbazaar.trade.plan.service.MailboxQuotaLock;
import java.time.*;
import java.sql.*;
import java.util.*;

/** Durable delete intent; a request alone never releases resource accounting. */
@Service
@RequiredArgsConstructor
public class MailboxDeletionService {
    private final JdbcTemplate jdbc;
    private final MailboxQuotaLock quota;
    private final MailboxPreservationService preservation;
    private final uz.efbazaar.trade.mailbox.provision.ProvisioningClaimService provisioning;
    private final Clock clock;

    public record Result(UUID requestId, String status, String lastError) {}
    public record Box(UUID id,String email,UUID owner,UUID retained,Instant provisioned,boolean deleted,
                      String deletionStatus,UUID deletionRequest,boolean syntheticPlaceholder) {}
    public record Ack(UUID requestId,UUID mailboxId,String mailboxEmail,boolean success,
                      boolean alreadyAbsent,String error,Instant occurredAt) {}

    public Box find(UUID box, boolean lock) {
        var rows=jdbc.query("SELECT * FROM mailboxes WHERE id=?"+(lock ? " FOR UPDATE" : ""),
            (rs,n)->new Box(rs.getObject("id",UUID.class),rs.getString("email"),
                rs.getObject("owner_user_id",UUID.class),rs.getObject("retained_user_id",UUID.class),
                instant(rs,"provisioned_at"),rs.getTimestamp("deleted_at")!=null,
                rs.getString("deletion_status"),rs.getObject("deletion_request_id",UUID.class),
                "TRADE".equals(rs.getString("source")) && "RANDOM".equals(rs.getString("kind"))
                    && rs.getString("email").matches("pending-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[^@]+")
                    && Arrays.equals(rs.getBytes("encrypted_password"),new byte[]{0})),box);
        if(rows.isEmpty()) throw new ApiCodeException(HttpStatus.NOT_FOUND,"mailbox_not_found","Pochta topilmadi");
        return rows.getFirst();
    }

    /** Caller already holds the responsible user locks and mailbox row lock. */
    @Transactional(propagation=org.springframework.transaction.annotation.Propagation.MANDATORY)
    public Result queue(Box box,UUID request) {
        provisioning.assertNoUnresolvedClaim(box.id());
        preservation.assertNotProtected(box.id());
        if (box.deletionRequest()!=null && !"FAILED".equals(box.deletionStatus())) return result(box.deletionRequest());
        Instant now=clock.instant();
        jdbc.update("INSERT INTO mailbox_deletion_requests(id,mailbox_id,email,requested_at,expected_owner,"
            +"expected_retained,expected_provisioned_at,status,next_dispatch_at) VALUES (?,?,?,?,?,?,?,'PENDING',?)",
            request,box.id(),box.email(),Timestamp.from(now),box.owner(),box.retained(),ts(box.provisioned()),Timestamp.from(now));
        jdbc.update("UPDATE mailboxes SET deletion_status='PENDING',deletion_request_id=?,deletion_error=NULL WHERE id=?",
            request,box.id());
        return new Result(request,"PENDING",null);
    }

    @Transactional
    public void requestUnheld(UUID id,String expectedEmail,Instant expectedProvisionedAt) {
        Box seen=find(id,false); quota.lock(seen.owner(),seen.retained()); Box box=find(id,true);
        if(box.deleted()) return;
        provisioning.assertNoUnresolvedClaim(id);
        if(!Objects.equals(box.email(),expectedEmail) || !Objects.equals(box.provisioned(),expectedProvisionedAt))
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,"Pochta qutisi o‘zgargan");
        if(box.owner()!=null || box.retained()!=null || Boolean.TRUE.equals(jdbc.queryForObject(
            "SELECT trade_id IS NOT NULL FROM mailboxes WHERE id=?",Boolean.class,id)))
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,"Pochta qutisi band");
        preservation.assertNotProtected(id);
        if(box.provisioned()==null && box.syntheticPlaceholder()) {
            // This exact internal placeholder address is never sent to Mailcow:
            // provisioning requests derive a separate address from mailboxId.
            // Null provisioning alone cannot prove that a real target address is absent.
            // No external mailbox was deleted or acknowledged. Keep this distinct
            // from a confirmed real-address tombstone: a late legacy provisioning
            // result must still restore the actual resource and its responsibility.
            jdbc.update("UPDATE mailboxes SET deleted_at=?,deletion_status='NONE' WHERE id=?",
                Timestamp.from(clock.instant()),id);
        } else queue(box,UUID.randomUUID());
    }

    public Result result(UUID request) {
        return jdbc.queryForObject("SELECT id,status,error FROM mailbox_deletion_requests WHERE id=?",
            (rs,n)->new Result(rs.getObject(1,UUID.class),rs.getString(2),rs.getString(3)),request);
    }

    @Transactional
    public void acknowledge(Ack ack) {
        if(ack.requestId()==null || ack.mailboxId()==null || ack.mailboxEmail()==null || ack.occurredAt()==null) return;
        var requests=jdbc.queryForList("SELECT * FROM mailbox_deletion_requests WHERE id=? AND mailbox_id=? AND email=?",
            ack.requestId(),ack.mailboxId(),ack.mailboxEmail());
        if(requests.isEmpty()) return;
        var request=requests.getFirst();
        Instant requested=((Timestamp)request.get("requested_at")).toInstant();
        if(ack.occurredAt().isBefore(requested) || ack.occurredAt().isAfter(clock.instant().plusSeconds(300))) return;
        quota.lock((UUID)request.get("expected_owner"),(UUID)request.get("expected_retained"));
        Box box=find(ack.mailboxId(),true);
        if(!Objects.equals(box.deletionRequest(),ack.requestId()) || box.deleted()
            || !Objects.equals(box.email(),request.get("email"))
            || !Objects.equals(box.owner(),request.get("expected_owner"))
            || !Objects.equals(box.retained(),request.get("expected_retained"))
            || !Objects.equals(box.provisioned(),instant(request.get("expected_provisioned_at")))) return;
        if(ack.success()) {
            // The external result resolves the intent. Freeze guard permits only this confirmed transition.
            jdbc.update("UPDATE mailboxes SET deletion_status='CONFIRMED',deletion_error=NULL,deleted_at=?,"
                +"owner_user_id=NULL,retained_user_id=NULL,linked_account_id=NULL,trade_id=NULL,display_name=NULL WHERE id=?",
                Timestamp.from(clock.instant()),box.id());
            jdbc.update("UPDATE mailbox_deletion_requests SET status='CONFIRMED',error=NULL,confirmed_at=? WHERE id=?",
                Timestamp.from(clock.instant()),ack.requestId());
        } else {
            String error=ack.error()==null ? "Mailcow deletion unconfirmed" : ack.error().substring(0,Math.min(1000,ack.error().length()));
            jdbc.update("UPDATE mailboxes SET deletion_status='FAILED',deletion_error=? WHERE id=?",error,box.id());
            jdbc.update("UPDATE mailbox_deletion_requests SET status='FAILED',error=? WHERE id=?",error,ack.requestId());
        }
    }

    /** Only call after a complete correlated successful inventory, never on a missing/error page. */
    @Transactional
    public void confirmAbsentFromInventory(UUID mailboxId,Instant observedAt) {
        var rows=jdbc.queryForList("SELECT r.id,r.email FROM mailbox_deletion_requests r JOIN mailboxes m "
            +"ON m.deletion_request_id=r.id WHERE m.id=? AND r.status IN ('PENDING','FAILED') AND r.requested_at<=?",
            mailboxId,Timestamp.from(observedAt));
        if(!rows.isEmpty()) {
            var row=rows.getFirst();
            acknowledge(new Ack((UUID)row.get("id"),mailboxId,(String)row.get("email"),true,true,null,observedAt));
        }
    }

    private static Timestamp ts(Instant at){return at==null?null:Timestamp.from(at);}
    private static Instant instant(Object at){return at==null?null:((Timestamp)at).toInstant();}
    private static Instant instant(ResultSet rs,String col) throws SQLException{return instant(rs.getTimestamp(col));}
}
