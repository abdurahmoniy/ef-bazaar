package uz.efbazaar.recommendation.watch;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.CardIdentityVerifier;
import uz.efbazaar.recommendation.match.MatchEngine;
import uz.efbazaar.recommendation.match.MatchRequestParser;
import uz.efbazaar.recommendation.plan.PlanCapabilities;
import uz.efbazaar.recommendation.projection.ProjectionWriter;
import uz.efbazaar.recommendation.projection.Snapshots;
import uz.efbazaar.recommendation.watch.SavedSearchDtos.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Import({SavedSearchService.class, ProjectionWriter.class, MatchRequestParser.class, CardIdentityVerifier.class, MatchEngine.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SavedSearchServiceIT {
    @Container @ServiceConnection static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired SavedSearchService service;
    @Autowired ProjectionWriter writer;
    @Autowired JdbcTemplate jdbc;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @MockBean org.springframework.kafka.core.KafkaTemplate<String,Object> kafka;
    @MockBean PlanCapabilities capabilities;
    final UUID user = UUID.randomUUID(), other = UUID.randomUUID(), seller = UUID.randomUUID();
    final AtomicInteger limit = new AtomicInteger(5);
    boolean ready;

    @BeforeEach void setup() {
        jdbc.execute("TRUNCATE search_notification_reasons,search_notification_intents,saved_searches,listing_cards_view,listings_view,consumed_events,cards_view");
        limit.set(5); ready = true;
        when(capabilities.capabilitiesSnapshot(any(), anyList())).thenAnswer(invocation -> new PlanCapabilities.Capabilities(java.util.Map.of(
                "watch.search_limit",new PlanCapabilities.Capability(ready?PlanCapabilities.Status.AVAILABLE:PlanCapabilities.Status.UNAVAILABLE,""+limit.get()),
                "watch.immediate",new PlanCapabilities.Capability(ready?PlanCapabilities.Status.AVAILABLE:PlanCapabilities.Status.UNAVAILABLE,""+(limit.get()>1))),Instant.EPOCH,java.util.Map.of("watch.search_limit",Instant.EPOCH)));
    }
    Request request(String name, int minimum) {
        return new Request(name, List.of(), 4, BigDecimal.valueOf(minimum), BigDecimal.valueOf(1000), true);
    }
    Snapshots.ListingSnapshot snapshot(UUID id, long version, long publication, Instant published, String status) {
        return new Snapshots.ListingSnapshot(id+":"+version, id, seller, status, BigDecimal.valueOf(500), null,
                List.of(), version, Instant.now(), published, publication);
    }
    void baseline(SavedSearchDtos.Item item) {
        jdbc.update("UPDATE saved_searches SET baseline_at=now()-interval '1 hour' WHERE id=?",item.id());
    }
    AuthorizationRequest intent(UUID listing, long publication) {
        UUID id=jdbc.queryForObject("SELECT id FROM search_notification_intents WHERE user_id=? AND listing_id=?",UUID.class,user,listing);
        return new AuthorizationRequest(id,user,listing,publication);
    }
    @Test void ownershipDuplicatesAndUnsupportedInput() {
        var one=service.create(user,request("one",1));
        assertThatThrownBy(()->service.get(other,one.id())).isInstanceOf(RecommendationException.class)
                .extracting("code").isEqualTo("saved_search_not_found");
        assertThatThrownBy(()->service.update(other,one.id(),request("other",2))).isInstanceOf(RecommendationException.class);
        assertThatThrownBy(()->service.patch(other,one.id(),new Patch(true,false))).isInstanceOf(RecommendationException.class);
        assertThatThrownBy(()->service.delete(other,one.id())).isInstanceOf(RecommendationException.class);
        assertThatThrownBy(()->service.priorities(other,List.of(one.id()))).isInstanceOf(RecommendationException.class);
        assertThatThrownBy(()->service.create(user,request("different name same criteria",1)))
                .isInstanceOf(RecommendationException.class).extracting("code").isEqualTo("saved_search_duplicate");
        assertThatThrownBy(()->service.create(user,new Request("empty",List.of(),4,null,null,true)))
                .isInstanceOf(RecommendationException.class);
        assertThatThrownBy(()->service.create(user,new Request("negative",List.of(),4,BigDecimal.valueOf(-1),null,true)))
                .isInstanceOf(RecommendationException.class);
        assertThat(service.list(other).items()).isEmpty();
    }
    @Test void limitsSerializeConcurrentCreatesForFreeAndPro() throws Exception {
        for(int cap:List.of(1,5)) {
            jdbc.execute("TRUNCATE saved_searches CASCADE"); limit.set(cap);
            var barrier=new CyclicBarrier(8);
            try(var pool=Executors.newFixedThreadPool(8)) {
                var work=java.util.stream.IntStream.range(0,8).<Callable<Boolean>>mapToObj(i->()->{
                    barrier.await(5,TimeUnit.SECONDS);
                    try { service.create(user,request("search"+i,i+1)); return true; }
                    catch(RecommendationException ex) { assertThat(ex.getCode()).isEqualTo("saved_search_limit"); return false; }
                }).toList();
                long successes=0;
                for(var result:pool.invokeAll(work)) if(result.get(10,TimeUnit.SECONDS)) successes++;
                assertThat(successes).isEqualTo(cap);
                assertThat(service.list(user).items()).hasSize(cap);
            }
        }
    }
    @Test void downgradeKeepsPreferredSearchAndPreservesPausedRows() {
        var a=service.create(user,request("a",1)); var b=service.create(user,request("b",2));
        service.priorities(user,List.of(b.id(),a.id())); limit.set(1);
        var items=service.list(user).items();
        assertThat(items).hasSize(2);
        assertThat(items.getFirst().id()).isEqualTo(b.id()); assertThat(items.getFirst().paused()).isFalse();
        assertThat(items.get(1).pauseReason()).isEqualTo("LIMIT");
        assertThatThrownBy(()->service.patch(user,a.id(),new Patch(false,null)))
                .isInstanceOf(RecommendationException.class).extracting("code").isEqualTo("saved_search_limit");
        service.patch(user,b.id(),new Patch(true,false));
        assertThat(service.get(user,b.id()).pauseReason()).isEqualTo("USER");
    }
    @Test void unavailableCapabilitiesFailClosedWithoutDeletingExistingSearches() {
        var a=service.create(user,request("a",1)); ready=false;
        assertThat(service.list(user).available()).isFalse();
        assertThat(service.get(user,a.id()).pauseReason()).isEqualTo("UNAVAILABLE");
        assertThatThrownBy(()->service.create(user,request("b",2))).isInstanceOf(RecommendationException.class)
                .extracting("code").isEqualTo("plan_projection_unavailable");
        service.patch(user,a.id(),new Patch(true,false)); service.delete(user,a.id());
        assertThat(service.list(user).items()).isEmpty();
    }
    @Test void firstSnapshotAndEditsNeverNotifyButTruePublicationAggregatesReasonsAndReplayIsHarmless() {
        var a=service.create(user,request("a",1)); var b=service.create(user,request("b",2)); baseline(a);baseline(b);
        UUID listing=UUID.randomUUID(); Instant published=Instant.now().minusSeconds(7200);
        writer.applyListing(snapshot(listing,1,1,published,"ACTIVE"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isZero();
        writer.applyListing(snapshot(listing,2,1,published,"ACTIVE"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isZero();
        writer.applyListing(snapshot(listing,3,2,Instant.now().minusSeconds(1),"ACTIVE"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isEqualTo(1);
        assertThat(service.authorize(intent(listing,2)).reasons()).hasSize(2);
        writer.applyListing(snapshot(listing,3,2,Instant.now().minusSeconds(1),"ACTIVE"));
        writer.applyListing(snapshot(listing,1,1,published,"SOLD"));
        writer.applyListing(snapshot(listing,4,1,published,"ACTIVE"));
        assertThat(jdbc.queryForObject("SELECT publication_version FROM listings_view WHERE listing_id=?",Long.class,listing)).isEqualTo(2L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isEqualTo(1);
    }
    @Test void queuedDeliveryRechecksOptInGenerationStatusOwnerAndEntitlements() {
        var a=service.create(user,request("a",1)); baseline(a);
        UUID listing=UUID.randomUUID(); var now=Instant.now().minusSeconds(3);
        writer.applyListing(snapshot(listing,1,1,now.minusSeconds(7200),"ACTIVE")); writer.applyListing(snapshot(listing,2,2,now.plusSeconds(1),"ACTIVE"));
        var pending=intent(listing,2);
        assertThat(service.authorize(pending).eligible()).isTrue();
        ready=false; assertThatThrownBy(()->service.authorize(pending)).isInstanceOf(RecommendationException.class);
        ready=true; limit.set(1); assertThat(service.authorize(pending).deliveryMode()).isEqualTo("DIGEST");
        service.patch(user,a.id(),new Patch(null,false)); assertThat(service.authorize(pending).eligible()).isFalse();
        service.patch(user,a.id(),new Patch(null,true)); assertThat(service.authorize(pending).eligible()).isFalse();
        jdbc.update("UPDATE saved_searches SET generation=1,baseline_at=now()-interval '1 hour' WHERE id=?",a.id());
        assertThat(service.authorize(pending).eligible()).isTrue();
        writer.applyListing(snapshot(listing,3,2,now,"SOLD")); assertThat(service.authorize(pending).eligible()).isFalse();
        writer.applyListing(new Snapshots.ListingSnapshot("owner",listing,user,"ACTIVE",BigDecimal.valueOf(500),null,List.of(),4,Instant.now(),now,2L));
        assertThat(service.authorize(pending).eligible()).isFalse();
    }
    @Test void firstEverTrustedPublicationAfterWatchBaselineAlertsOnce() {
        var search=service.create(user,request("new",1)); baseline(search);
        UUID listing=UUID.randomUUID(); var published=Instant.now().minusSeconds(2);
        writer.applyListing(snapshot(listing,1,1,published,"ACTIVE"));
        writer.applyListing(snapshot(listing,1,1,published,"ACTIVE"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isEqualTo(1);
        assertThat(service.authorize(intent(listing,1)).eligible()).isTrue();
    }
    void dispatch() {
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(ignored->new SearchCandidateDispatcher(jdbc,kafka).dispatch());
    }
    @Test void candidateOutboxRetriesBrokerFailureAndRestartWithoutLosingStableIdentity() {
        var search=service.create(user,request("retry",1)); baseline(search);
        UUID listing=UUID.randomUUID(); var published=Instant.now().minusSeconds(2);
        writer.applyListing(snapshot(listing,1,1,published,"ACTIVE"));
        var pending=intent(listing,1);
        when(kafka.send(anyString(),anyString(),any())).thenReturn(java.util.concurrent.CompletableFuture.failedFuture(new RuntimeException("offline")));
        dispatch();
        assertThat(jdbc.queryForObject("SELECT dispatched_at IS NULL AND attempts=1 FROM search_notification_intents WHERE id=?",Boolean.class,pending.intentId())).isTrue();
        assertThat(jdbc.queryForObject("SELECT next_attempt_at>created_at FROM search_notification_intents WHERE id=?",Boolean.class,pending.intentId())).isTrue();
        jdbc.update("UPDATE search_notification_intents SET next_attempt_at=now() WHERE id=?",pending.intentId());
        when(kafka.send(anyString(),anyString(),any())).thenReturn(java.util.concurrent.CompletableFuture.completedFuture(null));
        dispatch();
        dispatch();
        assertThat(jdbc.queryForObject("SELECT dispatched_at IS NOT NULL AND attempts=2 FROM search_notification_intents WHERE id=?",Boolean.class,pending.intentId())).isTrue();
        var event=org.mockito.ArgumentCaptor.forClass(Object.class);
        org.mockito.Mockito.verify(kafka,org.mockito.Mockito.times(2)).send(org.mockito.ArgumentMatchers.eq(SearchCandidateDispatcher.TOPIC),org.mockito.ArgumentMatchers.eq(user.toString()),event.capture());
        assertThat(event.getAllValues()).allSatisfy(value->assertThat(((Candidate)value).intentId()).isEqualTo(pending.intentId()));
    }
    @Test void priceOnlyDuplicateIgnoresMeaninglessStrictnessAndMoneyScale() {
        service.create(user,request("canonical",1));
        assertThatThrownBy(()->service.create(user,new Request("duplicate",List.of(),10,new BigDecimal("1.00"),new BigDecimal("1000.00"),true)))
                .isInstanceOf(RecommendationException.class).extracting("code").isEqualTo("saved_search_duplicate");
    }
    @Test void weightedStrictnessAndPriceBoundsUseExistingCardMatching() {
        UUID player=UUID.randomUUID(),second=UUID.randomUUID();
        jdbc.update("INSERT INTO cards_view(efhub_id,player_id,type,meta_priority,version) VALUES(777,?,'EPIC',0,1)",player);
        jdbc.update("INSERT INTO cards_view(efhub_id,player_id,type,meta_priority,version) VALUES(778,?,'EPIC',0,1)",second);
        var search=service.create(user,new Request("strict",List.of("777:"+player+":P","778:"+second+":N"),8,BigDecimal.valueOf(400),BigDecimal.valueOf(600),true));
        baseline(search);
        UUID alternate=UUID.randomUUID();
        writer.applyListing(new Snapshots.ListingSnapshot("alt",alternate,seller,"ACTIVE",BigDecimal.valueOf(500),null,
            List.of(new Snapshots.CardRef(999,player)),1,Instant.now(),Instant.now().minusSeconds(1),1L));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isZero();
        UUID exact=UUID.randomUUID();
        writer.applyListing(new Snapshots.ListingSnapshot("exact",exact,seller,"ACTIVE",BigDecimal.valueOf(600),null,
            List.of(new Snapshots.CardRef(777,player),new Snapshots.CardRef(778,second)),1,Instant.now(),Instant.now().minusSeconds(1),1L));
        assertThat(service.authorize(intent(exact,1)).eligible()).isTrue();
        UUID expensive=UUID.randomUUID();
        writer.applyListing(new Snapshots.ListingSnapshot("expensive",expensive,seller,"ACTIVE",BigDecimal.valueOf(601),null,
            List.of(new Snapshots.CardRef(777,player),new Snapshots.CardRef(778,second)),1,Instant.now(),Instant.now().minusSeconds(1),1L));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isEqualTo(1);
    }
    @Test void equivalentCardIdentityFormattingCannotAllocateDuplicateSearches() {
        UUID player=UUID.randomUUID();
        jdbc.update("INSERT INTO cards_view(efhub_id,player_id,type,meta_priority,version) VALUES(777,?,'EPIC',0,1)",player);
        service.create(user,new Request("canonical",List.of("777:"+player+":P"),4,null,null,true));
        assertThatThrownBy(()->service.create(user,new Request("duplicate",List.of("+00777:"+player.toString().toUpperCase()+":P"),4,null,null,true)))
                .isInstanceOf(RecommendationException.class).extracting("code").isEqualTo("saved_search_duplicate");
    }
    @Test void renewalReactivatesLimitPausedMatchesWithoutAUserListRequest() {
        var a=service.create(user,request("first",700)); var b=service.create(user,request("second",1)); baseline(a);baseline(b);
        limit.set(1); service.list(user);
        assertThat(jdbc.queryForObject("SELECT limit_paused FROM saved_searches WHERE id=?",Boolean.class,b.id())).isTrue();
        limit.set(5);
        UUID listing=UUID.randomUUID(); writer.applyListing(snapshot(listing,1,1,Instant.now().minusSeconds(1),"ACTIVE"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isEqualTo(1);
        assertThat(service.authorize(intent(listing,1)).reasons()).extracting(Reason::watchId).containsExactly(b.id());
    }
    @Test void projectionReceiptCardsAndIntentCommitAtomicallyAcrossFailureAndReplay() {
        var search=service.create(user,request("atomic",1)); baseline(search);
        UUID listing=UUID.randomUUID(); var snapshot=snapshot(listing,1,1,Instant.now().minusSeconds(1),"ACTIVE");
        jdbc.execute("ALTER TABLE search_notification_intents ADD CONSTRAINT test_reject_candidate CHECK (user_id <> '"+user+"'::uuid)");
        try {
            assertThatThrownBy(()->writer.applyListing(snapshot)).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM listings_view WHERE listing_id=?",Integer.class,listing)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM consumed_events WHERE idempotency_key=?",Integer.class,snapshot.idempotencyKey())).isZero();
        } finally { jdbc.execute("ALTER TABLE search_notification_intents DROP CONSTRAINT test_reject_candidate"); }
        assertThat(writer.applyListing(snapshot)).isTrue();
        assertThat(service.authorize(intent(listing,1)).eligible()).isTrue();
    }
    @Test void deletedSearchAndForgedIntentCannotAuthorizeQueuedNotification() {
        var search=service.create(user,request("delete",1)); baseline(search);
        UUID listing=UUID.randomUUID(); writer.applyListing(snapshot(listing,1,1,Instant.now().minusSeconds(1),"ACTIVE"));
        var pending=intent(listing,1);
        assertThat(service.authorize(new AuthorizationRequest(pending.intentId(),other,listing,1)).eligible()).isFalse();
        assertThat(service.authorize(new AuthorizationRequest(pending.intentId(),user,UUID.randomUUID(),1)).eligible()).isFalse();
        service.delete(user,search.id());
        assertThat(service.authorize(pending).eligible()).isFalse();
    }
    @Test void futureAndLegacySnapshotsDoNotInventNewPublicationAlerts() {
        var search=service.create(user,request("future",1)); baseline(search);
        UUID future=UUID.randomUUID(); writer.applyListing(snapshot(future,1,1,Instant.now().plusSeconds(60),"ACTIVE"));
        UUID legacy=UUID.randomUUID(); writer.applyListing(new Snapshots.ListingSnapshot("legacy",legacy,seller,"ACTIVE",BigDecimal.valueOf(500),null,List.of(),1,Instant.now()));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isZero();
    }
    @Test void oldPublicationsBeforeWatchBaselineDoNotNotify() {
        service.create(user,request("a",1)); UUID listing=UUID.randomUUID(); var old=Instant.now().minusSeconds(60);
        writer.applyListing(snapshot(listing,1,0,null,"ACTIVE"));
        writer.applyListing(snapshot(listing,2,1,old,"ACTIVE"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM search_notification_intents",Integer.class)).isZero();
    }
}
