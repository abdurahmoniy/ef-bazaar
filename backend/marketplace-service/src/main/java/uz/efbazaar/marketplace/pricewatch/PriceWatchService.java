package uz.efbazaar.marketplace.pricewatch;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.plan.PlanCapabilities;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import java.time.Instant;
import java.util.*;

/** Owner rows serialize quota decisions across tabs and service replicas. */
@Service
public class PriceWatchService {
    final JdbcTemplate jdbc;
    private final PlanCapabilities capabilities;
    private final AuthSummaryClient identities;
    public PriceWatchService(@Qualifier("marketplaceJdbcTemplate") JdbcTemplate jdbc, PlanCapabilities capabilities, AuthSummaryClient identities) {
        this.jdbc=jdbc; this.capabilities=capabilities; this.identities=identities;
    }
    public record Item(UUID id,UUID listingId,boolean paused,String pauseReason,int priority,Instant createdAt) {}
    public record View(List<Item> items,Integer limit,boolean notificationsEnabled,boolean telegramEnabled,boolean immediate,boolean available) {}
    public record Policy(Integer limit,boolean immediate,boolean available,Instant sourceTime) {
        public Policy(Integer limit,boolean immediate,boolean available){this(limit,immediate,available,null);}
    }
    public Policy policy(UUID user) {
        var snapshot=capabilities.capabilitiesSnapshot(user,List.of("watch.price_limit","watch.immediate"));
        var limit=snapshot.values().get("watch.price_limit");
        var mode=snapshot.values().get("watch.immediate");
        if(limit.status()!=PlanCapabilities.Status.AVAILABLE || mode.status()!=PlanCapabilities.Status.AVAILABLE)
            return new Policy(3,false,false);
        if(!"true".equals(mode.value()) && !"false".equals(mode.value()))return new Policy(3,false,false);
        try {
            Integer count=limit.unlimited()?null:Integer.valueOf(limit.value());
            if(count!=null && count<0)return new Policy(3,false,false);
            Instant source=snapshot.sourceTime(),budget=snapshot.grantSourceTimes().get("watch.price_limit");
            if(source==null || budget!=null && budget.isAfter(source))source=budget;
            return new Policy(count,"true".equals(mode.value()),true,source);
        } catch(NumberFormatException e){return new Policy(3,false,false);}
    }
    void lock(UUID user) {
        jdbc.update("INSERT INTO watch_preferences(user_id) VALUES (?) ON CONFLICT DO NOTHING",user);
        jdbc.queryForObject("SELECT user_id FROM watch_preferences WHERE user_id=? FOR UPDATE",UUID.class,user);
    }
    @Transactional public View list(UUID user) { return view(user,true); }
    private View view(UUID user,boolean automatic) {
        lock(user); Policy policy=policy(user); reconcile(user,policy,automatic);
        var prefs=jdbc.queryForMap("SELECT notifications_enabled,telegram_enabled FROM watch_preferences WHERE user_id=?",user);
        var visible=items(user).stream().map(item->!policy.available() && !"USER".equals(item.pauseReason())
                ? new Item(item.id(),item.listingId(),true,"UNAVAILABLE",item.priority(),item.createdAt()) : item).toList();
        return new View(visible,policy.limit(),(boolean)prefs.get("notifications_enabled"),(boolean)prefs.get("telegram_enabled"),policy.immediate(),policy.available());
    }
    List<Item> items(UUID user) {
        return jdbc.query("SELECT * FROM price_watches WHERE user_id=? ORDER BY priority,created_at,id",(rs,n)->new Item(rs.getObject("id",UUID.class),rs.getObject("listing_id",UUID.class),rs.getString("pause_reason")!=null,rs.getString("pause_reason"),rs.getInt("priority"),rs.getTimestamp("created_at").toInstant()),user);
    }
    void reconcile(UUID user,Policy p) { reconcile(user,p,true); }
    void reconcile(UUID user,Policy p,boolean automatic) {
        // Unknown policy defers authorization; it must not erase a watch's logical
        // active state or baseline. Durable price candidates remain retryable.
        if(!p.available()) {
            // An explicit selection changes the user's activation boundary even
            // while policy is unknown. Keep active outage candidates intact, but
            // never later replay history for rows the user still sees as LIMIT.
            if(!automatic)jdbc.update("UPDATE price_watches SET baseline_price_version=COALESCE((SELECT price_version FROM listings WHERE id=listing_id),baseline_price_version) WHERE user_id=? AND pause_reason='LIMIT'",user);
            return;
        }
        int rank=0;
        for(Item item:items(user)) {
            if("USER".equals(item.pauseReason()))continue;
            String reason=p.limit()!=null && rank++>=p.limit()?"LIMIT":null;
            if(!Objects.equals(reason,item.pauseReason())) {
                // A resumed watch starts from current state; paused history is never replayed.
                if(reason==null && automatic) {
                    // New grants resume from their source timestamp, preserving the first later price event.
                    jdbc.update("UPDATE price_watches SET pause_reason=NULL,baseline_price_version=GREATEST(baseline_price_version,COALESCE((SELECT max(e.price_version) FROM watch_price_events e WHERE e.listing_id=price_watches.listing_id AND e.occurred_at<=?),0)) WHERE id=?",p.sourceTime()==null?null:java.sql.Timestamp.from(p.sourceTime()),item.id());
                } else {
                    jdbc.update("UPDATE price_watches SET pause_reason=?,baseline_price_version=CASE WHEN CAST(? AS varchar) IS NULL THEN COALESCE((SELECT price_version FROM listings WHERE id=listing_id),baseline_price_version) ELSE baseline_price_version END WHERE id=?",reason,reason,item.id());
                }
            }
        }
    }
    @Transactional public Item create(UUID user,UUID listing) {
        lock(user); Policy p=policy(user); requireAvailable(p); reconcile(user,p);
        var duplicate=items(user).stream().filter(x->x.listingId().equals(listing)).findFirst();
        if(duplicate.isPresent())return duplicate.get();
        var rows=jdbc.queryForList("SELECT seller_id,status,price_version FROM listings WHERE id=? FOR SHARE",listing);
        if(rows.isEmpty())throw MarketplaceException.listingNotFound();
        // Waiting for the listing lock can outlive entitlement freshness or a
        // paid subscription. Allocate only against policy read after that wait.
        p=policy(user);requireAvailable(p);reconcile(user,p);
        var row=rows.getFirst();
        if(user.equals(row.get("seller_id")))throw error(HttpStatus.FORBIDDEN,"own_listing_watch","O‘z e’loningizni kuzatib bo‘lmaydi");
        if(!"ACTIVE".equals(row.get("status")))throw error(HttpStatus.CONFLICT,"listing_not_active","E’lon faol emas");
        if(p.limit()!=null && items(user).size()>=p.limit())throw error(HttpStatus.CONFLICT,"watch_limit","Kuzatuvlar limiti tugadi");
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO price_watches(id,user_id,listing_id,priority,baseline_price_version) VALUES (?,?,?,COALESCE((SELECT max(priority)+1 FROM price_watches WHERE user_id=?),0),?)",id,user,listing,user,row.get("price_version"));
        return owned(user,id);
    }
    @Transactional public Item pause(UUID user,UUID id,boolean paused) {
        lock(user); Item item=owned(user,id);
        if(paused) {
            jdbc.update("UPDATE price_watches SET pause_reason='USER' WHERE id=?",id);
            reconcile(user,policy(user),false);
        }
        else if(item.paused()) {
            Policy p=policy(user);requireAvailable(p);
            // Explicit resume makes this row eligible; priority selects it within the same budget.
            // A rejected low-priority selection rolls the entire transaction back, retaining USER pause.
            jdbc.update("UPDATE price_watches SET pause_reason=NULL,baseline_price_version=COALESCE((SELECT price_version FROM listings WHERE id=listing_id),baseline_price_version) WHERE id=?",id);
            reconcile(user,p,false);
            if(owned(user,id).paused())throw error(HttpStatus.CONFLICT,"watch_limit","Kuzatuvlar limiti tugadi. Avval asosiy kuzatuvni tanlang");
        }
        return owned(user,id);
    }
    @Transactional public void delete(UUID user,UUID id){lock(user);owned(user,id);jdbc.update("DELETE FROM price_watches WHERE id=?",id);reconcile(user,policy(user),false);}
    @Transactional public View priorities(UUID user,List<UUID> ids) {
        lock(user);var all=items(user);
        if(ids.size()!=new HashSet<>(ids).size() || ids.size()!=all.size() || !new HashSet<>(ids).equals(new HashSet<>(all.stream().map(Item::id).toList())))
            throw error(HttpStatus.BAD_REQUEST,"invalid_watch_priorities","Barcha o‘z kuzatuvlaringizni bir martadan tanlang");
        for(int i=0;i<ids.size();i++)jdbc.update("UPDATE price_watches SET priority=? WHERE id=? AND user_id=?",i,ids.get(i),user);
        return view(user,false);
    }
    @Transactional public View preferences(UUID user,boolean enabled,boolean telegram) {
        lock(user);
        if(enabled && telegram)identities.requireTelegramLinked(user);
        boolean changed=enabled!=Boolean.TRUE.equals(jdbc.queryForObject("SELECT notifications_enabled FROM watch_preferences WHERE user_id=?",Boolean.class,user));
        jdbc.update("UPDATE watch_preferences SET notifications_enabled=?,telegram_enabled=? WHERE user_id=?",enabled,telegram,user);
        if(changed) {
            jdbc.update("UPDATE watch_preferences SET notifications_since=clock_timestamp() WHERE user_id=?",user);
            jdbc.update("UPDATE price_watches SET baseline_price_version=COALESCE((SELECT price_version FROM listings WHERE id=listing_id),baseline_price_version) WHERE user_id=?",user);
        }
        if(!enabled) {
            jdbc.update("UPDATE watch_intents SET state='DISCARDED' WHERE user_id=? AND state='PENDING'",user);
            jdbc.update("UPDATE watch_deliveries SET telegram_state='SKIPPED' WHERE user_id=? AND telegram_state='PENDING'",user);
        }
        return list(user);
    }
    Item owned(UUID user,UUID id){return items(user).stream().filter(x->x.id().equals(id)).findFirst().orElseThrow(()->error(HttpStatus.NOT_FOUND,"watch_not_found","Kuzatuv topilmadi"));}
    void requireAvailable(Policy p){if(!p.available())throw error(HttpStatus.SERVICE_UNAVAILABLE,"watch_entitlement_unavailable","Tarif imkoniyatlarini hozir tekshirib bo‘lmadi");}
    static MarketplaceException error(HttpStatus status,String code,String message){return new MarketplaceException(status,code,message);}
}
