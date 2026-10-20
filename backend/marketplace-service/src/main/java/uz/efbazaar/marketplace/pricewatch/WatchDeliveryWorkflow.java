package uz.efbazaar.marketplace.pricewatch;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static uz.efbazaar.marketplace.pricewatch.WatchMessages.*;

/** All retryable work is durable. In-app delivery commits atomically with its intent receipts. */
@Slf4j @Service
public class WatchDeliveryWorkflow {
    private static final ZoneId ZONE=ZoneId.of("Asia/Samarkand");
    private final JdbcTemplate jdbc;
    private final PriceWatchService watches;
    private final ObjectMapper json;
    private final TransactionTemplate tx;
    private final RestClient recommendation,bot;
    private final AuthSummaryClient identities;
    private final String secret;
    private UUID reconciliationCursor;
    private UUID deliveryCursor;
    private UUID telegramCursor;
    public WatchDeliveryWorkflow(@Qualifier("marketplaceJdbcTemplate")JdbcTemplate jdbc,PriceWatchService watches,ObjectMapper json,
            PlatformTransactionManager transactions,@Qualifier("watchRecommendationClient")RestClient recommendation,
            @Qualifier("watchBotClient")RestClient bot,AuthSummaryClient identities,@Value("${app.internal.secret:}")String secret){
        this.jdbc=jdbc;this.watches=watches;this.json=json;this.tx=new TransactionTemplate(transactions);
        this.recommendation=recommendation;this.bot=bot;this.identities=identities;this.secret=secret;
    }
    public void accept(Candidate e) {
        if(e==null||e.intentId()==null||e.userId()==null||e.listingId()==null||e.publicationVersion()==null||e.publicationVersion()<=0||e.publishedAt()==null||e.occurredAt()==null||e.idempotencyKey()==null||e.idempotencyKey().isBlank()||e.occurredAt().isAfter(Instant.now().plusSeconds(60))||e.publishedAt().isAfter(Instant.now().plusSeconds(60)))return;
        tx.executeWithoutResult(status->{
            watches.lock(e.userId());
            boolean enabled=Boolean.TRUE.equals(jdbc.queryForObject("SELECT notifications_enabled AND ?>=notifications_since AND ?>=notifications_since FROM watch_preferences WHERE user_id=?",Boolean.class,Timestamp.from(e.occurredAt()),Timestamp.from(e.publishedAt()),e.userId()));
            jdbc.update("""
                INSERT INTO watch_intents(id,user_id,listing_id,event_key,publication_version,source_intent_id,reasons,created_at,state)
                VALUES (?,?,?,?,?,?,?::jsonb,?,?) ON CONFLICT(user_id,listing_id,event_key) DO NOTHING
                """,UUID.randomUUID(),e.userId(),e.listingId(),"publication:"+e.publicationVersion(),e.publicationVersion(),e.intentId(),encode(safeReasons(e.reasons())),Timestamp.from(e.occurredAt()),enabled?"PENDING":"DISCARDED");
        });
    }
    public void process(Instant now) {
        // Rotate batches so an unavailable owner cannot starve later users.
        List<UUID> owners=ownerBatch(false,reconciliationCursor);
        if(owners.isEmpty()){reconciliationCursor=null;owners=ownerBatch(false,null);}
        for(UUID user:owners)tx.executeWithoutResult(status->{watches.lock(user);watches.reconcile(user,watches.policy(user),true);});
        if(!owners.isEmpty())reconciliationCursor=owners.getLast();
        materializePrices();
        List<UUID> users=ownerBatch(true,deliveryCursor);
        if(users.isEmpty()){deliveryCursor=null;users=ownerBatch(true,null);}
        if(!users.isEmpty())deliveryCursor=users.getLast();
        for(UUID user:users){try{tx.executeWithoutResult(status->deliver(user,now));}catch(Exception e){log.warn("Watch delivery deferred for user={}: {}",user,e.toString());}}
        jdbc.update("UPDATE watch_deliveries SET telegram_state='UNCONFIRMED' WHERE telegram_state='SENDING' AND telegram_claimed_at<now()-interval '10 minutes'");
        List<UUID> deliveries=telegramBatch(telegramCursor);
        if(deliveries.isEmpty()){telegramCursor=null;deliveries=telegramBatch(null);}
        if(!deliveries.isEmpty())telegramCursor=deliveries.getLast();
        for(UUID id:deliveries)telegram(id);
    }
    private List<UUID> ownerBatch(boolean pending,UUID after) {
        String table=pending?"watch_intents":"price_watches";
        return jdbc.query("SELECT DISTINCT user_id FROM "+table+" WHERE (CAST(? AS uuid) IS NULL OR user_id>?)"+(pending?" AND state='PENDING'":"")+" ORDER BY user_id LIMIT 100",(rs,n)->rs.getObject(1,UUID.class),after,after);
    }
    private List<UUID> telegramBatch(UUID after) {
        return jdbc.query("SELECT id FROM watch_deliveries WHERE telegram_state='PENDING' AND (CAST(? AS uuid) IS NULL OR id>?) ORDER BY id LIMIT 100",(rs,n)->rs.getObject(1,UUID.class),after,after);
    }
    private void materializePrices(){tx.executeWithoutResult(status->{
        var events=jdbc.queryForList("SELECT * FROM watch_price_events WHERE processed_at IS NULL ORDER BY occurred_at LIMIT 100 FOR UPDATE SKIP LOCKED");
        // Materialization only stores durable candidates, never grants delivery.
        // Unknown policies preserve active watches; deliver rechecks fresh current
        // authorization, so one unavailable owner cannot lose events or block others.
        // Sort owner locks consistently across replicas, including owners outside the rotating sweep.
        var owners=new TreeSet<UUID>();
        for(var event:events)owners.addAll(jdbc.query("SELECT DISTINCT user_id FROM price_watches WHERE listing_id=?",(rs,n)->rs.getObject(1,UUID.class),event.get("listing_id")));
        var unavailable=new HashSet<UUID>();
        for(UUID user:owners){
            watches.lock(user);var policy=watches.policy(user);
            if(!policy.available())unavailable.add(user);
            watches.reconcile(user,policy,true);
        }
        for(var event:events){
            UUID listing=(UUID)event.get("listing_id");long version=((Number)event.get("price_version")).longValue();
            for(var watch:jdbc.queryForList("SELECT w.id,w.user_id,w.pause_reason FROM price_watches w JOIN watch_preferences p USING(user_id) WHERE w.listing_id=? AND w.pause_reason IS DISTINCT FROM 'USER' AND w.baseline_price_version<? AND p.notifications_enabled",listing,version)){
                // A delayed renewal may already cover this event. Preserve unknown
                // policy candidates; resumed baseline and final quota decide later.
                if(watch.get("pause_reason")!=null&&!unavailable.contains(watch.get("user_id")))continue;
                List<Reason> reasons=List.of(new Reason((UUID)watch.get("id"),"Narx o‘zgardi"));
                jdbc.update("""
                    INSERT INTO watch_intents(id,user_id,listing_id,event_key,publication_version,reasons,old_price,new_price,created_at)
                    VALUES(?,?,?,?,?,?::jsonb,?,?,?) ON CONFLICT(user_id,listing_id,event_key) DO NOTHING
                    """,UUID.randomUUID(),watch.get("user_id"),listing,"price:"+version,event.get("publication_version"),encode(reasons),event.get("old_price"),event.get("new_price"),event.get("occurred_at"));
            }
            jdbc.update("UPDATE watch_price_events SET processed_at=clock_timestamp() WHERE listing_id=? AND price_version=?",listing,version);
        }
    });}
    private void deliver(UUID user,Instant now){
        watches.lock(user); var policy=watches.policy(user); watches.reconcile(user,policy);
        if(!policy.available())return;
        var prefs=jdbc.queryForMap("SELECT notifications_enabled,telegram_enabled FROM watch_preferences WHERE user_id=?",user);
        if(!(boolean)prefs.get("notifications_enabled")){jdbc.update("UPDATE watch_intents SET state='DISCARDED' WHERE user_id=? AND state='PENDING'",user);return;}
        LocalDate date=now.atZone(ZONE).toLocalDate();
        if(!policy.immediate() && now.atZone(ZONE).toLocalTime().isBefore(LocalTime.of(19,0)))return;
        Instant cutoff=policy.immediate()?now:date.atTime(19,0).atZone(ZONE).toInstant();
        if(!policy.immediate() && jdbc.queryForObject("SELECT count(*) FROM watch_deliveries WHERE user_id=? AND digest_date=?",Integer.class,user,java.sql.Date.valueOf(date))>0)return;
        var pending=jdbc.queryForList("SELECT * FROM watch_intents WHERE user_id=? AND state='PENDING' AND created_at<=? ORDER BY created_at,id LIMIT 500 FOR UPDATE",user,Timestamp.from(cutoff));
        var eligible=new ArrayList<Map<String,Object>>();
        var itemMap=new LinkedHashMap<UUID,Map<String,Object>>();
        for(var intent:pending){
            UUID listing=(UUID)intent.get("listing_id");
            var listings=jdbc.queryForList("SELECT status,seller_id,publication_version FROM listings WHERE id=? FOR SHARE",listing);
            List<Reason> reasons=List.of();
            if(!listings.isEmpty() && "ACTIVE".equals(listings.getFirst().get("status")) && !user.equals(listings.getFirst().get("seller_id")) && ((Number)listings.getFirst().get("publication_version")).longValue()==((Number)intent.get("publication_version")).longValue()){
                if(intent.get("source_intent_id")!=null){
                    Authorization auth=recommendation.post().uri("/internal/rec/v1/watches/authorize").header("X-Internal-Secret",secret).contentType(MediaType.APPLICATION_JSON)
                        .body(new AuthorizationRequest((UUID)intent.get("source_intent_id"),user,listing,((Number)intent.get("publication_version")).longValue())).retrieve().body(Authorization.class);
                    if(auth==null || auth.deliveryMode()==null)throw new IllegalStateException("Missing current search authorization");
                    if(auth.eligible())reasons=safeReasons(auth.reasons());
                    if(auth.eligible() && policy.immediate() && !"IMMEDIATE".equals(auth.deliveryMode()))throw new IllegalStateException("Watch entitlement projections disagree; defer delivery");
                }else{
                    reasons=currentPriceReasons(user,intent);
                }
            }
            if(reasons.isEmpty()){jdbc.update("UPDATE watch_intents SET state='DISCARDED' WHERE id=?",intent.get("id"));continue;}
            eligible.add(intent);
            var item=itemMap.computeIfAbsent(listing,key->{var v=new LinkedHashMap<String,Object>();v.put("listingId",key);v.put("reasons",new ArrayList<String>());return v;});
            @SuppressWarnings("unchecked") List<String> labels=(List<String>)item.get("reasons");
            for(Reason r:reasons)if(labels.size()<5&&!labels.contains(r.label()))labels.add(r.label());
            if(intent.get("old_price")!=null){item.putIfAbsent("oldPrice",intent.get("old_price"));item.put("newPrice",intent.get("new_price"));}
        }
        if(eligible.isEmpty())return;
        // Listing locks and recommendation HTTP can outlive the initial policy.
        // Leave candidates pending if it changed; the next sweep reconciles quota
        // and cadence against a fresh snapshot before trying delivery again.
        if(!policy.equals(watches.policy(user)))return;
        var allItems=new ArrayList<>(itemMap.values());
        Map<String,Object> payload=Map.of("items",allItems.stream().limit(20).toList(),"totalCount",allItems.size(),"remainingCount",Math.max(0,allItems.size()-20));
        UUID delivery=UUID.randomUUID(),notice=UUID.randomUUID();
        jdbc.update("INSERT INTO watch_deliveries(id,user_id,digest_date,payload,notification_id,telegram_state) VALUES(?,?,?,?::jsonb,?,?)",delivery,user,policy.immediate()?null:java.sql.Date.valueOf(date),encode(payload),notice,(boolean)prefs.get("telegram_enabled")?"PENDING":"SKIPPED");
        jdbc.update("INSERT INTO notifications(id,user_id,type,listing_id,watch_payload,created_at) VALUES(?,?,?,?,?::jsonb,?)",notice,user,policy.immediate()?"WATCH_MATCH":"WATCH_DIGEST",allItems.size()==1?itemMap.keySet().iterator().next():null,encode(payload),Timestamp.from(now));
        for(var intent:eligible)jdbc.update("UPDATE watch_intents SET state='DELIVERED',delivery_id=? WHERE id=?",delivery,intent.get("id"));
    }
    private record TelegramClaim(UUID id,long chatId,String text) {}
    private void telegram(UUID id){
        TelegramClaim claim;
        try{claim=tx.execute(status->{
            var owners=jdbc.queryForList("SELECT user_id FROM watch_deliveries WHERE id=? AND telegram_state='PENDING'",id);
            if(owners.isEmpty())return null;
            UUID user=(UUID)owners.getFirst().get("user_id");
            // All owner mutations take preferences before delivery rows; keep the same lock order.
            watches.lock(user);
            var rows=jdbc.queryForList("SELECT * FROM watch_deliveries WHERE id=? AND telegram_state='PENDING' FOR UPDATE SKIP LOCKED",id);
            if(rows.isEmpty())return null;
            var row=rows.getFirst();
            var prefs=jdbc.queryForMap("SELECT notifications_enabled,telegram_enabled FROM watch_preferences WHERE user_id=?",user);
            var p=watches.policy(user);
            if(!p.available())return null;
            if(!(boolean)prefs.get("notifications_enabled") || !(boolean)prefs.get("telegram_enabled") || row.get("digest_date")==null&&!p.immediate()) {skipTelegram(id);return null;}
            var identity=identities.resolve(user);
            if(identity.isEmpty())return null;
            if(identity.get().telegramId()==null){skipTelegram(id);return null;}
            // Recheck current visibility and ownership immediately before claiming the external request.
            var visible=jdbc.queryForList("SELECT DISTINCT i.listing_id FROM watch_intents i JOIN listings l ON l.id=i.listing_id WHERE i.delivery_id=? AND l.status='ACTIVE' AND l.seller_id<>? AND l.publication_version=i.publication_version",id,user);
            if(visible.isEmpty()){skipTelegram(id);return null;}
            boolean authorized=false;
            watches.reconcile(user,p);
            for(var intent:jdbc.queryForList("SELECT i.* FROM watch_intents i JOIN listings l ON l.id=i.listing_id WHERE i.delivery_id=? AND l.status='ACTIVE' AND l.seller_id<>? AND l.publication_version=i.publication_version",id,user)) {
                if(intent.get("source_intent_id")==null) {
                    if(!currentPriceReasons(user,intent).isEmpty())authorized=true;
                } else {
                    Authorization auth=recommendation.post().uri("/internal/rec/v1/watches/authorize").header("X-Internal-Secret",secret).contentType(MediaType.APPLICATION_JSON)
                        .body(new AuthorizationRequest((UUID)intent.get("source_intent_id"),user,(UUID)intent.get("listing_id"),((Number)intent.get("publication_version")).longValue())).retrieve().body(Authorization.class);
                    if(auth==null||auth.deliveryMode()==null)throw new IllegalStateException("Missing current search authorization");
                    if(auth.eligible() && (row.get("digest_date")!=null||"IMMEDIATE".equals(auth.deliveryMode())))authorized=true;
                }
            }
            if(!authorized){skipTelegram(id);return null;}
            // Identity/recommendation lookups can block while paid rights change.
            if(!p.equals(watches.policy(user)))return null;
            String text=(row.get("digest_date")==null?"Kuzatuvingizga mos yangilik":"Kuzatuvlar bo‘yicha kunlik jamlanma")+"\n"+visible.size()+" ta e’lon\nhttps://efbazaar.uz/watches";
            jdbc.update("UPDATE watch_deliveries SET telegram_state='SENDING',telegram_claimed_at=clock_timestamp() WHERE id=?",id);
            return new TelegramClaim(id,identity.get().telegramId(),text);
        });}catch(Exception e){log.warn("Telegram watch claim deferred id={}: {}",id,e.toString());return;}
        if(claim==null)return;
        try{
            TelegramResponse result=bot.post().uri("/bot/internal/watches/dm").header("X-Internal-Secret",secret).contentType(MediaType.APPLICATION_JSON).body(new TelegramRequest(claim.id(),claim.chatId(),claim.text())).retrieve().body(TelegramResponse.class);
            jdbc.update("UPDATE watch_deliveries SET telegram_state=?,telegram_message_id=? WHERE id=? AND telegram_state='SENDING'",result!=null&&result.messageId()!=null?"SENT":"UNCONFIRMED",result==null?null:result.messageId(),id);
        }catch(Exception e){jdbc.update("UPDATE watch_deliveries SET telegram_state='UNCONFIRMED' WHERE id=? AND telegram_state='SENDING'",id);log.warn("Telegram watch result unconfirmed; not retried id={}: {}",id,e.toString());}
    }
    private List<Reason> currentPriceReasons(UUID user,Map<String,Object> intent) {
        String key=String.valueOf(intent.get("event_key"));
        if(!key.startsWith("price:"))return List.of();
        long version;
        try{version=Long.parseLong(key.substring(6));}catch(NumberFormatException e){return List.of();}
        var active=jdbc.query("SELECT id FROM price_watches WHERE user_id=? AND listing_id=? AND pause_reason IS NULL AND baseline_price_version<?",(rs,n)->rs.getObject(1,UUID.class),user,intent.get("listing_id"),version);
        return decodeReasons(intent.get("reasons")).stream().filter(r->active.contains(r.watchId())).toList();
    }
    private void skipTelegram(UUID id){jdbc.update("UPDATE watch_deliveries SET telegram_state='SKIPPED' WHERE id=?",id);}
    private List<Reason> safeReasons(List<Reason> reasons){if(reasons==null)return List.of();return reasons.stream().filter(r->r!=null&&r.watchId()!=null&&r.label()!=null&&!r.label().isBlank()).limit(5).map(r->new Reason(r.watchId(),r.label().substring(0,Math.min(100,r.label().length())))).toList();}
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException("Cannot serialize watch data",e);}}
    private List<Reason> decodeReasons(Object value){try{return json.readValue(value.toString(),new TypeReference<List<Reason>>(){});}catch(Exception e){throw new IllegalStateException("Invalid stored watch reasons",e);}}
}
