package uz.efbazaar.recommendation.watch;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.*;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import uz.efbazaar.recommendation.exception.RecommendationException;
import uz.efbazaar.recommendation.match.*;
import uz.efbazaar.recommendation.plan.*;
import uz.efbazaar.recommendation.projection.*;
import static org.assertj.core.api.Assertions.*;

@JdbcTest
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Import({PlanProjection.class,PlanCapabilities.class,SavedSearchService.class,ProjectionWriter.class,MatchRequestParser.class,CardIdentityVerifier.class,MatchEngine.class})
@Transactional(propagation=Propagation.NOT_SUPPORTED)
class SavedSearchRecoveryIT {
    @Container @ServiceConnection static PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired JdbcTemplate jdbc;
    @Autowired SavedSearchService searches;
    @Autowired ProjectionWriter writer;
    @Autowired PlanProjection plans;
    UUID user,healthy,seller,first,target;

    @BeforeEach void setup() {
        jdbc.execute("TRUNCATE search_notification_reasons,search_notification_intents,saved_searches,listing_cards_view,listings_view,consumed_events,cards_view,plan_event_receipts,plan_projection_state,plan_entitlement_view,user_plan_view CASCADE");
        user=UUID.randomUUID();healthy=UUID.randomUUID();seller=UUID.randomUUID();
        catalog("STANDARD",1,1);catalog("PRO",5,1);
        move(user,"PRO",1,now());
        first=searches.create(user,request("nonmatching",700)).id();target=searches.create(user,request("target",1)).id();
        jdbc.update("UPDATE saved_searches SET baseline_at=clock_timestamp()-interval '1 hour'");
        move(user,"STANDARD",2,now());searches.list(user);
        assertThat(jdbc.queryForObject("SELECT limit_paused FROM saved_searches WHERE id=?",Boolean.class,target)).isTrue();
        move(healthy,"STANDARD",1,now());searches.create(healthy,request("healthy",1));
        jdbc.update("UPDATE saved_searches SET baseline_at=clock_timestamp()-interval '1 hour' WHERE user_id=?",healthy);
    }
    SavedSearchDtos.Request request(String name,int min) {return new SavedSearchDtos.Request(name,List.of(),4,BigDecimal.valueOf(min),BigDecimal.valueOf(1000),true);}
    Instant now(){return jdbc.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class).toInstant();}
    void catalog(String code,int limit,long version){plans.replacePlan(code,Map.of("watch.search_limit",String.valueOf(limit),"watch.immediate",String.valueOf(limit>1)),version,UUID.randomUUID().toString(),now());}
    void move(UUID owner,String code,long version,Instant source){plans.userMoved(owner,code,code.equals("STANDARD")?null:Instant.now().plusSeconds(86400),version,UUID.randomUUID().toString(),source);}
    void unavailable(){jdbc.update("UPDATE plan_projection_state SET occurred_at=clock_timestamp()-interval '25 hours' WHERE kind='user' AND entity_id=?",user.toString());}
    UUID publish() {UUID id=UUID.randomUUID();writer.applyListing(new Snapshots.ListingSnapshot(id+":1",id,seller,"ACTIVE",BigDecimal.valueOf(500),null,List.of(),1,Instant.now(),now(),1L));return id;}
    int intents(UUID owner){return jdbc.queryForObject("SELECT count(*) FROM search_notification_intents WHERE user_id=?",Integer.class,owner);}
    SavedSearchDtos.AuthorizationRequest intent(UUID owner,UUID listing){UUID id=jdbc.queryForObject("SELECT id FROM search_notification_intents WHERE user_id=? AND listing_id=?",UUID.class,owner,listing);return new SavedSearchDtos.AuthorizationRequest(id,owner,listing,1L);}

    @ParameterizedTest @ValueSource(booleans={false,true})
    void recognizedOutageRetainsOnlyPostRenewalPublicationAndDoesNotBlockHealthyFreeOwner(boolean readBeforeAuthorize) {
        unavailable();UUID pre=publish();Instant renewal=now();UUID post=publish();
        assertThat(intents(user)).as("unknown policy retains potential LIMIT matches for later authorization").isEqualTo(2);
        assertThat(intents(healthy)).isEqualTo(2);
        assertThat(searches.authorize(intent(healthy,post)).deliveryMode()).isEqualTo("DIGEST");
        assertThatThrownBy(()->searches.authorize(intent(user,post))).isInstanceOf(RecommendationException.class).extracting("code").isEqualTo("plan_projection_unavailable");
        move(user,"PRO",3,renewal);if(readBeforeAuthorize)searches.list(user);
        assertThat(searches.authorize(intent(user,pre)).eligible()).as("publication before canonical renewal is still paused history").isFalse();
        assertThat(searches.authorize(intent(user,post)).reasons()).extracting(SavedSearchDtos.Reason::watchId).containsExactly(target);
        assertThat(intents(user)).isEqualTo(2);
    }
    @Test void knownFreeRecoveryCannotAuthorizeRetainedLimitCandidates() {
        unavailable();UUID post=publish();assertThat(intents(user)).isEqualTo(1);
        move(user,"STANDARD",3,now());
        assertThat(searches.authorize(intent(user,post)).eligible()).isFalse();
        assertThat(searches.list(user).items()).filteredOn(item->!item.paused()).hasSize(1);
    }
    @ParameterizedTest @ValueSource(strings={"criteria","pause","optout","delete","priority","delete-primary","delete-primary-unavailable"})
    void explicitOwnerChangesInvalidateOutageCandidates(String operation) {
        unavailable();Instant renewal=now();UUID post=publish();assertThat(intents(user)).isEqualTo(1);
        if(operation.equals("priority")||operation.startsWith("delete-primary")) {
            if(!operation.equals("delete-primary-unavailable"))move(user,"STANDARD",3,now());
            if(operation.equals("priority"))searches.priorities(user,List.of(target,first));
            else searches.delete(user,first);
            if(operation.equals("delete-primary-unavailable"))move(user,"STANDARD",3,now());
        } else {
            move(user,"PRO",3,renewal);searches.list(user);
            switch(operation) {
                case "criteria" -> searches.update(user,target,request("edited",2));
                case "pause" -> {searches.patch(user,target,new SavedSearchDtos.Patch(true,null));searches.patch(user,target,new SavedSearchDtos.Patch(false,null));}
                case "optout" -> {searches.patch(user,target,new SavedSearchDtos.Patch(null,false));searches.patch(user,target,new SavedSearchDtos.Patch(null,true));}
                case "delete" -> searches.delete(user,target);
                default -> throw new AssertionError(operation);
            }
        }
        assertThat(searches.authorize(intent(user,post)).eligible()).as("explicit %s cannot revive a prior candidate generation",operation).isFalse();
        if(!operation.equals("delete"))assertThat(searches.authorize(intent(user,publish())).eligible()).isTrue();
    }
    @Test void catalogIncreaseUsesEffectiveGrantBoundaryAndIdenticalReplaysDoNotMoveIt() {
        unavailable();UUID pre=publish();Instant grant=now();
        plans.replacePlan("STANDARD",Map.of("watch.search_limit","2","watch.immediate","false"),2,UUID.randomUUID().toString(),grant);
        UUID post=publish();assertThat(intents(user)).isEqualTo(2);
        plans.replacePlan("STANDARD",Map.of("watch.search_limit","2","watch.immediate","false"),3,UUID.randomUUID().toString(),now());
        move(user,"STANDARD",3,now());
        assertThat(searches.authorize(intent(user,pre)).eligible()).isFalse();
        assertThat(searches.authorize(intent(user,post)).eligible()).as("identical subscription/catalog recovery is freshness, not a new grant").isTrue();
    }
}
