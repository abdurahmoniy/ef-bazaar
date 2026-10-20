package uz.efbazaar.recommendation.watch;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.MatchEngine;
import uz.efbazaar.recommendation.match.MatchRequestParser;
import uz.efbazaar.recommendation.plan.PlanCapabilities;
import uz.efbazaar.recommendation.projection.Snapshots.ListingSnapshot;
import uz.efbazaar.recommendation.watch.SavedSearchDtos.*;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** All owner allocations and priority changes serialize on the same PostgreSQL transaction lock. */
@Service
@RequiredArgsConstructor
public class SavedSearchService {
    private final JdbcTemplate jdbc;
    private final MatchRequestParser parser;
    private final MatchEngine engine;
    private final PlanCapabilities capabilities;
    private final ObjectMapper mapper = new ObjectMapper();

    record Access(Integer limit, boolean immediate, boolean available, Instant sourceTime) {}
    record Row(UUID id, UUID userId, String name, List<String> cards, int strictness, BigDecimal min,
               BigDecimal max, boolean userPaused, boolean limitPaused, int priority, boolean enabled,
               Instant baseline, long generation, Instant createdAt) {}
    record Criteria(String name, List<String> cards, int strictness, BigDecimal min, BigDecimal max, String fingerprint) {}

    @Transactional
    public Listing list(UUID userId) {
        lock(userId); Access access=access(userId);
        if(access.available()) reconcile(userId,access);
        return new Listing(rows(userId).stream().map(row->item(row,access)).toList(),access.limit(),access.immediate(),access.available());
    }

    @Transactional
    public Item get(UUID userId, UUID id) {
        lock(userId); Access access=access(userId);
        if(access.available()) reconcile(userId,access);
        return item(owned(userId,id),access);
    }

    @Transactional
    public Item create(UUID userId, Request request) {
        Criteria criteria=criteria(request); lock(userId); Access access=requiredAccess(userId);
        duplicate(userId,null,criteria.fingerprint());
        if(access.limit()!=null && rows(userId).size()>=access.limit()) throw limit();
        UUID id=UUID.randomUUID();
        int priority=jdbc.queryForObject("SELECT coalesce(max(priority),0)+1 FROM saved_searches WHERE user_id=?",Integer.class,userId);
        jdbc.update("""
            INSERT INTO saved_searches(id,user_id,name,match_cards,match_strictness,min_price,max_price,fingerprint,priority,notifications_enabled)
            VALUES(?,?,?,?::jsonb,?,?,?,?,?,?)
            """,id,userId,criteria.name(),json(criteria.cards()),criteria.strictness(),criteria.min(),criteria.max(),
                criteria.fingerprint(),priority,request.notificationsEnabled()==null || request.notificationsEnabled());
        return item(owned(userId,id),access);
    }

    @Transactional
    public Item update(UUID userId, UUID id, Request request) {
        Criteria criteria=criteria(request); lock(userId); owned(userId,id); Access access=requiredAccess(userId);
        duplicate(userId,id,criteria.fingerprint());
        jdbc.update("""
            UPDATE saved_searches SET name=?,match_cards=?::jsonb,match_strictness=?,min_price=?,max_price=?,fingerprint=?,
                notifications_enabled=coalesce(?,notifications_enabled),baseline_at=statement_timestamp(),generation=generation+1
            WHERE id=? AND user_id=?
            """,criteria.name(),json(criteria.cards()),criteria.strictness(),criteria.min(),criteria.max(),criteria.fingerprint(),
                request.notificationsEnabled(),id,userId);
        reconcile(userId,access); return item(owned(userId,id),access);
    }

    @Transactional
    public Item patch(UUID userId, UUID id, Patch patch) {
        lock(userId); Row row=owned(userId,id); Access access=access(userId);
        boolean allocating=Boolean.FALSE.equals(patch.paused()) || Boolean.TRUE.equals(patch.notificationsEnabled());
        if(allocating && !access.available()) throw unavailable();
        if(access.available()) { reconcile(userId,access); row=owned(userId,id); }
        if(Boolean.FALSE.equals(patch.paused()) && row.limitPaused()) throw limit();
        boolean changed=(patch.paused()!=null && patch.paused()!=row.userPaused())
                || (patch.notificationsEnabled()!=null && patch.notificationsEnabled()!=row.enabled());
        jdbc.update("""
            UPDATE saved_searches SET user_paused=coalesce(?,user_paused),notifications_enabled=coalesce(?,notifications_enabled),
                generation=generation+?,baseline_at=CASE WHEN ? THEN statement_timestamp() ELSE baseline_at END
            WHERE id=? AND user_id=?
            """,patch.paused(),patch.notificationsEnabled(),changed?1:0,changed,id,userId);
        return item(owned(userId,id),access);
    }

    @Transactional
    public void delete(UUID userId, UUID id) {
        lock(userId); owned(userId,id); jdbc.update("DELETE FROM saved_searches WHERE id=? AND user_id=?",id,userId);
        Access access=access(userId); reconcile(userId,access,false);
    }

    @Transactional
    public Listing priorities(UUID userId, List<UUID> ids) {
        lock(userId); List<Row> current=rows(userId);
        if(ids==null || ids.size()!=current.size() || new HashSet<>(ids).size()!=ids.size()
                || !new HashSet<>(ids).equals(new HashSet<>(current.stream().map(Row::id).toList())))
            throw bad("saved_search_priority_invalid","Barcha o'z qidiruvlaringizni bir martadan tanlang");
        Access access=requiredAccess(userId);
        for(int i=0;i<ids.size();i++) jdbc.update("UPDATE saved_searches SET priority=? WHERE id=? AND user_id=?",i+1,ids.get(i),userId);
        reconcile(userId,access,false);
        return list(userId);
    }

    /** Called inside the projection transaction, after its accepted version and cards were written. */
    @Transactional
    public void publication(ListingSnapshot snapshot, long previousPublication) {
        Long publication=snapshot.publicationVersion(); Instant published=snapshot.publishedAt();
        if(publication==null || publication<=previousPublication || publication<=0
                || published==null || published.isAfter(Instant.now()) || !"ACTIVE".equals(snapshot.status())) return;
        List<UUID> users=jdbc.queryForList("""
            SELECT DISTINCT user_id FROM saved_searches WHERE notifications_enabled AND NOT user_paused
                AND baseline_at < ? AND user_id <> ? ORDER BY user_id
            """,UUID.class,Timestamp.from(published),snapshot.sellerId());
        for(UUID userId:users) {
            lock(userId);
            Access access=access(userId);
            if(access.available()) reconcile(userId,access);
            List<Row> matches=rows(userId).stream().filter(row->!row.userPaused() && (!row.limitPaused() || !access.available()) && row.enabled()
                    && published.isAfter(row.baseline()) && matches(row,snapshot.listingId(),snapshot.price())).toList();
            if(matches.isEmpty()) continue;
            UUID id=UUID.randomUUID();
            jdbc.update("""
                INSERT INTO search_notification_intents(id,user_id,listing_id,publication_version,published_at)
                VALUES(?,?,?,?,?) ON CONFLICT(user_id,listing_id,publication_version) DO NOTHING
                """,id,userId,snapshot.listingId(),publication,Timestamp.from(published));
            id=jdbc.queryForObject("SELECT id FROM search_notification_intents WHERE user_id=? AND listing_id=? AND publication_version=?",
                    UUID.class,userId,snapshot.listingId(),publication);
            for(Row row:matches) jdbc.update("""
                INSERT INTO search_notification_reasons(intent_id,search_id,generation) VALUES(?,?,?) ON CONFLICT DO NOTHING
                """,id,row.id(),row.generation());
        }
    }

    @Transactional
    public Authorization authorize(AuthorizationRequest request) {
        if(request.userId()==null || request.intentId()==null || request.listingId()==null || request.publicationVersion()<=0)
            return denied("DIGEST");
        lock(request.userId());
        boolean bound=Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM search_notification_intents WHERE id=? AND user_id=? AND listing_id=? AND publication_version=?)
            """,Boolean.class,request.intentId(),request.userId(),request.listingId(),request.publicationVersion()));
        if(!bound) return denied("DIGEST");
        Access access=requiredAccess(request.userId()); reconcile(request.userId(),access);
        String mode=access.immediate()?"IMMEDIATE":"DIGEST";
        List<BigDecimal> prices=jdbc.query("""
            SELECT price FROM listings_view WHERE listing_id=? AND status='ACTIVE' AND seller_id<>? AND publication_version=?
            """,(rs,n)->rs.getBigDecimal(1),request.listingId(),request.userId(),request.publicationVersion());
        if(prices.isEmpty()) return denied(mode);
        List<Reason> reasons=new ArrayList<>();
        for(Row row:rows(request.userId())) {
            if(row.userPaused() || row.limitPaused() || !row.enabled()) continue;
            boolean pending=Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS(SELECT 1 FROM search_notification_reasons r JOIN search_notification_intents i ON i.id=r.intent_id
                    WHERE r.intent_id=? AND r.search_id=? AND r.generation=? AND i.published_at>?)
                """,Boolean.class,request.intentId(),row.id(),row.generation(),Timestamp.from(row.baseline())));
            if(pending && matches(row,request.listingId(),prices.getFirst())) reasons.add(new Reason(row.id(),row.name()));
        }
        return new Authorization(!reasons.isEmpty(),List.copyOf(reasons),mode);
    }

    private boolean matches(Row row,UUID listingId,BigDecimal price) {
        if((row.min()!=null && (price==null || price.compareTo(row.min())<0))
                || (row.max()!=null && (price==null || price.compareTo(row.max())>0))) return false;
        if(row.cards().isEmpty()) return true;
        var request=parser.parse(row.cards(),row.strictness()).orElseThrow();
        var hit=engine.hits(request.weighted(),List.of(listingId)).get(listingId);
        return hit!=null && (request.anyPositiveOverlap()?hit.score().signum()>0:hit.score().compareTo(request.minimumScore())>=0);
    }
    private Criteria criteria(Request request) {
        if(request==null || request.name()==null || request.name().isBlank() || request.name().strip().length()>80)
            throw bad("saved_search_invalid","Qidiruv nomi 1–80 belgidan iborat bo'lishi kerak");
        List<String> cards=request.matchCard()==null?List.of():request.matchCard().stream().sorted(Comparator.nullsFirst(String::compareTo)).toList();
        int strictness=request.matchStrictness()==null?4:request.matchStrictness();
        if(strictness<1 || strictness>10) throw bad("saved_search_invalid","Moslik darajasi 1–10");
        var parsed=parser.parse(cards,strictness);
        if(parsed.isPresent()) {
            cards=parsed.get().criteria().stream()
                .map(card->card.efhubId()+":"+card.playerId()+":"+(card.importance()==uz.efbazaar.recommendation.match.MatchCardCriterion.Importance.PRIORITY?"P":"N"))
                .sorted().toList();
        } else {
            strictness=MatchRequestParser.DEFAULT_STRICTNESS;
        }
        BigDecimal min=money(request.minPrice()),max=money(request.maxPrice());
        if(cards.isEmpty() && min==null && max==null) throw bad("saved_search_invalid","Karta yoki narx oralig'i kerak");
        if(min!=null && max!=null && min.compareTo(max)>0) throw bad("saved_search_invalid","Narx oralig'i noto'g'ri");
        try {
            String canonical=json(cards)+":"+strictness+":"+min+":"+max;
            String fingerprint=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
            return new Criteria(request.name().strip(),cards,strictness,min,max,fingerprint);
        } catch(java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private BigDecimal money(BigDecimal value) {
        if(value==null) return null;
        if(value.signum()<0 || value.stripTrailingZeros().scale()>2 || value.precision()-value.scale()>17)
            throw bad("saved_search_invalid","Narx manfiy bo'lmasin va eng ko'pi ikki kasr xonasi bo'lsin");
        return value.stripTrailingZeros();
    }
    private Access access(UUID userId) {
        var snapshot=capabilities.capabilitiesSnapshot(userId,List.of("watch.search_limit","watch.immediate"));
        var grants=snapshot.values();
        var limit=grants.get("watch.search_limit");
        var immediate=grants.get("watch.immediate");
        if(limit.status()!=PlanCapabilities.Status.AVAILABLE || immediate.status()!=PlanCapabilities.Status.AVAILABLE)
            return new Access(null,false,false,null);
        try {
            Integer count=limit.value()==null?null:Integer.valueOf(limit.value());
            if(count!=null && count<0) return new Access(null,false,false,null);
            if(!"true".equals(immediate.value()) && !"false".equals(immediate.value())) return new Access(null,false,false,null);
            Instant source=snapshot.sourceTime(),budget=snapshot.grantSourceTimes().get("watch.search_limit");
            if(source==null || budget!=null && budget.isAfter(source))source=budget;
            return new Access(count,"true".equals(immediate.value()),true,source);
        } catch(NumberFormatException e) { return new Access(null,false,false,null); }
    }
    private Access requiredAccess(UUID userId) { Access access=access(userId); if(!access.available()) throw unavailable(); return access; }
    private void reconcile(UUID userId,Access access) { reconcile(userId,access,true); }
    private void reconcile(UUID userId,Access access,boolean automatic) {
        if(!access.available()) {
            // An explicit delete may promote a LIMIT row after policy recovers.
            // Preserve active outage work, but do not replay its paused history.
            if(!automatic)jdbc.update("UPDATE saved_searches SET baseline_at=clock_timestamp(),generation=generation+1 WHERE user_id=? AND limit_paused",userId);
            return;
        }
        jdbc.update("""
            WITH ranked AS (SELECT id,(row_number() OVER (ORDER BY priority,created_at,id)>coalesce(?,2147483647)) AS paused
                FROM saved_searches WHERE user_id=?)
            UPDATE saved_searches s SET limit_paused=r.paused,
                generation=s.generation+CASE WHEN r.paused OR NOT ? THEN 1 ELSE 0 END,
                baseline_at=CASE WHEN NOT r.paused THEN
                    CASE WHEN ? THEN greatest(s.baseline_at,CAST(? AS timestamptz)) ELSE clock_timestamp() END
                    ELSE s.baseline_at END
            FROM ranked r WHERE s.id=r.id AND s.limit_paused<>r.paused
            """,access.limit(),userId,automatic,automatic,access.sourceTime()==null?null:Timestamp.from(access.sourceTime()));
    }
    private void duplicate(UUID userId,UUID id,String fingerprint) {
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM saved_searches WHERE user_id=? AND fingerprint=? AND (?::uuid IS NULL OR id<>?))",
                Boolean.class,userId,fingerprint,id,id))) throw new RecommendationException(HttpStatus.CONFLICT,"saved_search_duplicate","Bu qidiruv saqlangan");
    }
    private void lock(UUID userId) { jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?::text,8173))",userId.toString()); }
    private List<Row> rows(UUID userId) { return jdbc.query("SELECT * FROM saved_searches WHERE user_id=? ORDER BY priority,created_at,id",this::row,userId); }
    private Row owned(UUID userId,UUID id) { return jdbc.query("SELECT * FROM saved_searches WHERE id=? AND user_id=?",this::row,id,userId)
            .stream().findFirst().orElseThrow(()->new RecommendationException(HttpStatus.NOT_FOUND,"saved_search_not_found","Qidiruv topilmadi")); }
    private Row row(ResultSet rs,int number) throws SQLException {
        try { return new Row(rs.getObject("id",UUID.class),rs.getObject("user_id",UUID.class),rs.getString("name"),
                mapper.readValue(rs.getString("match_cards"),new TypeReference<List<String>>(){}),rs.getInt("match_strictness"),
                rs.getBigDecimal("min_price"),rs.getBigDecimal("max_price"),rs.getBoolean("user_paused"),rs.getBoolean("limit_paused"),
                rs.getInt("priority"),rs.getBoolean("notifications_enabled"),rs.getTimestamp("baseline_at").toInstant(),
                rs.getLong("generation"),rs.getTimestamp("created_at").toInstant()); }
        catch(com.fasterxml.jackson.core.JsonProcessingException e) { throw new SQLException("Invalid stored search criteria",e); }
    }
    private Item item(Row row,Access access) {
        String reason=row.userPaused()?"USER":!access.available()?"UNAVAILABLE":row.limitPaused()?"LIMIT":null;
        return new Item(row.id(),row.name(),row.cards(),row.strictness(),row.min(),row.max(),reason!=null,reason,row.priority(),row.enabled(),row.createdAt());
    }
    private String json(Object value) { try { return mapper.writeValueAsString(value); } catch(Exception e) { throw new IllegalArgumentException(e); } }
    private Authorization denied(String mode) { return new Authorization(false,List.of(),mode); }
    private static RecommendationException bad(String code,String message) { return RecommendationException.badRequest(code,message); }
    private static RecommendationException limit() { return new RecommendationException(HttpStatus.CONFLICT,"saved_search_limit","Saqlangan qidiruvlar limiti tugadi"); }
    private static RecommendationException unavailable() { return new RecommendationException(HttpStatus.SERVICE_UNAVAILABLE,"plan_projection_unavailable","Tarif imkoniyatlari yangilanmoqda"); }
}
