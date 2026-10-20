package uz.efbazaar.marketplace.pricewatch;

import com.fasterxml.jackson.databind.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.client.RestClient;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.http.MediaType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import uz.efbazaar.marketplace.config.SecurityConfig;
import uz.efbazaar.marketplace.exception.GlobalExceptionHandler;
import uz.efbazaar.marketplace.plan.*;
import uz.efbazaar.marketplace.security.*;
import javax.sql.DataSource;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringJUnitConfig(PriceWatchIT.Config.class)
@WebAppConfiguration
@Testcontainers
class PriceWatchIT {
 @Container static PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:16-alpine");
 @Autowired WebApplicationContext context;
 @Autowired FilterChainProxy security;
 @Autowired JdbcTemplate jdbc;
 @Autowired ObjectMapper json;
 @Autowired PlanProjection plans;
 @Autowired AuthSummaryClient identities;
 MockMvc mvc;
 UUID user;
 @BeforeEach void setup() throws Exception {
   for(var field:WatchDeliveryWorkflow.class.getDeclaredFields())if(field.getName().endsWith("Cursor")){field.setAccessible(true);field.set(context.getBean(WatchDeliveryWorkflow.class),null);}
   jdbc.execute("TRUNCATE price_watches,watch_price_events,watch_intents,watch_deliveries,watch_preferences,notifications,plan_event_receipts,plan_projection_state,plan_entitlement_view,user_plan_view CASCADE");
   Config.rec.reset();Config.bot.reset();reset(identities);
   mvc=MockMvcBuilders.webAppContextSetup(context).addFilters(security).build(); user=UUID.randomUUID();
   plans.replacePlan("STANDARD",Map.of("watch.price_limit","3","watch.immediate","false"),System.nanoTime(),UUID.randomUUID().toString(),Instant.now());
   plans.replacePlan("PRO",Map.of("watch.price_limit","20","watch.immediate","true"),System.nanoTime(),UUID.randomUUID().toString(),Instant.now());
   move("STANDARD",1);
   doThrow(new uz.efbazaar.marketplace.exception.MarketplaceException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"telegram_check_unavailable","Unavailable")).when(identities).requireTelegramLinked(any());
 }
 @Test void coherentWatchPolicyCannotCombineProQuotaWithFreeDeliveryMode() {
   move("PRO",2);var swapped=new java.util.concurrent.atomic.AtomicBoolean();
   JdbcTemplate racing=new JdbcTemplate(jdbc.getDataSource()) {
     void downgrade(){if(swapped.compareAndSet(false,true))move("STANDARD",3);}
     @Override public <T>T queryForObject(String sql,org.springframework.jdbc.core.RowMapper<T> mapper,Object...args){T result=super.queryForObject(sql,mapper,args);downgrade();return result;}
     @Override public <T>T query(String sql,org.springframework.jdbc.core.ResultSetExtractor<T> extractor,Object...args){T result=super.query(sql,extractor,args);downgrade();return result;}
   };
   var service=new PriceWatchService(jdbc,new PlanCapabilities(new PlanProjection(racing)),identities);
   var policy=service.policy(user);
   assertThat(policy.limit()==20&&policy.immediate() || policy.limit()==3&&!policy.immediate()).as("quota and cadence must belong to one effective plan snapshot").isTrue();
 }
 @Test void freeLimitDuplicateOwnerIsolationAndPauseResume() throws Exception {
   UUID listing=listing(); JsonNode first=create(listing);
   assertThat(create(listing).path("id").asText()).isEqualTo(first.path("id").asText());
   create(listing()); create(listing());
   call(post("/api/v1/price-watches"),Map.of("listingId",listing())).andExpect(status().isConflict());
   mvc.perform(as(get("/api/v1/price-watches"),UUID.randomUUID())).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
   mvc.perform(as(delete("/api/v1/price-watches/"+first.path("id").asText()),UUID.randomUUID())).andExpect(status().isNotFound());
   call(patch("/api/v1/price-watches/"+first.path("id").asText()),Map.of("paused",true)).andExpect(status().isOk());
   call(post("/api/v1/price-watches"),Map.of("listingId",listing())).andExpect(status().isConflict());
   call(patch("/api/v1/price-watches/"+first.path("id").asText()),Map.of("paused",false)).andExpect(status().isOk());
 }
 @Test void explicitlyResumingPrimaryUserPausedWatchSelectsItWithinFreeBudget() throws Exception {
   move("PRO",2);String primary=create(listing()).path("id").asText();create(listing());create(listing());String fourth=create(listing()).path("id").asText();
   call(patch("/api/v1/price-watches/"+primary),Map.of("paused",true)).andExpect(status().isOk());move("STANDARD",3);
   mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   call(patch("/api/v1/price-watches/"+primary),Map.of("paused",false)).andExpect(status().isOk()).andExpect(jsonPath("$.paused").value(false));
   assertThat(jdbc.queryForObject("SELECT count(*) FROM price_watches WHERE user_id=? AND pause_reason IS NULL",Integer.class,user)).isEqualTo(3);
   assertThat(jdbc.queryForObject("SELECT pause_reason FROM price_watches WHERE id=?",String.class,UUID.fromString(fourth))).isEqualTo("LIMIT");
 }
 @Test void lowerPriorityUserResumeRejectsAndPreservesUserPause() throws Exception {
   move("PRO",2);create(listing());create(listing());create(listing());String fourth=create(listing()).path("id").asText();
   call(patch("/api/v1/price-watches/"+fourth),Map.of("paused",true)).andExpect(status().isOk());move("STANDARD",3);
   call(patch("/api/v1/price-watches/"+fourth),Map.of("paused",false)).andExpect(status().isConflict());
   assertThat(jdbc.queryForObject("SELECT pause_reason FROM price_watches WHERE id=?",String.class,UUID.fromString(fourth))).isEqualTo("USER");
 }
 @Test void anonymousRequestsAndOwnOrInactiveListingsAreRejected() throws Exception {
   mvc.perform(get("/api/v1/price-watches")).andExpect(status().is4xxClientError());
   UUID own=listing(); jdbc.update("UPDATE listings SET seller_id=? WHERE id=?",user,own);
   call(post("/api/v1/price-watches"),Map.of("listingId",own)).andExpect(status().isForbidden());
   UUID sold=listing(); jdbc.update("UPDATE listings SET status='SOLD' WHERE id=?",sold);
   call(post("/api/v1/price-watches"),Map.of("listingId",sold)).andExpect(status().isConflict());
 }
 @Test void downgradePreservesTwentyRowsAndPrioritySelectsFreeThree() throws Exception {
   move("PRO",2); List<String> ids=new ArrayList<>();
   for(int i=0;i<20;i++) ids.add(create(listing()).path("id").asText());
   call(post("/api/v1/price-watches"),Map.of("listingId",listing())).andExpect(status().isConflict());
   move("STANDARD",3);
   JsonNode list=read(mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk()));
   assertThat(list.path("items")).hasSize(20);
   assertThat(java.util.stream.StreamSupport.stream(list.path("items").spliterator(),false).filter(x->!x.path("paused").asBoolean()).count()).isEqualTo(3);
   Collections.reverse(ids);
   call(put("/api/v1/price-watches/priorities"),Map.of("ids",ids)).andExpect(status().isOk());
   JsonNode reordered=read(mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk()));
   assertThat(reordered.path("items").get(0).path("id").asText()).isEqualTo(ids.get(0));
   assertThat(reordered.path("items").get(0).path("paused").asBoolean()).isFalse();
 }
 @Test void concurrentCreatesCannotOversubscribe() throws Exception {
   List<UUID> listings=new ArrayList<>(); for(int i=0;i<8;i++) listings.add(listing());
   var pool=Executors.newFixedThreadPool(8); var start=new CountDownLatch(1); var futures=new ArrayList<Future<Integer>>();
   try {for(UUID id:listings) futures.add(pool.submit(()->{start.await();return call(post("/api/v1/price-watches"),Map.of("listingId",id)).andReturn().getResponse().getStatus();}));
   start.countDown(); List<Integer> codes=new ArrayList<>();for(var f:futures)codes.add(f.get(20,TimeUnit.SECONDS));
   assertThat(codes.stream().filter(x->x==201).count()).isEqualTo(3);assertThat(codes.stream().filter(x->x==409).count()).isEqualTo(5);
   }finally {pool.shutdownNow();}
 }
 @Test void oldPriceChangesDoNotNotifyNewWatchAndReplayIsHarmless() throws Exception {
   move("PRO",2); UUID id=listing();jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);create(id);process(Instant.now());
   assertThat(notices()).isZero();
   jdbc.update("UPDATE listings SET price=80 WHERE id=?",id);process(Instant.now());process(Instant.now());
   assertThat(notices()).isEqualTo(1);
   jdbc.update("UPDATE listings SET description='unchanged price' WHERE id=?",id);process(Instant.now());assertThat(notices()).isEqualTo(1);
   jdbc.update("UPDATE listings SET price=70 WHERE id=?",id);process(Instant.now());assertThat(notices()).isEqualTo(2);
 }
 @Test void temporaryUnavailableProjectionRetainsPriceTransitionUntilRecovery() throws Exception {
   move("PRO",2);UUID id=listing();create(id);
   jdbc.update("UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user' AND entity_id=?",user.toString());
   mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   process(Instant.now());assertThat(notices()).isZero();
   move("PRO",3);process(Instant.now());process(Instant.now());
   assertThat(notices()).as("temporary projection outage must defer, not lose, an eligible price transition").isEqualTo(1);
   JsonNode payload=json.readTree(jdbc.queryForObject("SELECT watch_payload::text FROM notifications WHERE user_id=?",String.class,user));
   assertThat(payload.path("items").get(0).path("oldPrice").decimalValue()).isEqualByComparingTo("100");
   assertThat(payload.path("items").get(0).path("newPrice").decimalValue()).isEqualByComparingTo("90");
 }
 @Test void missingGrantDefersOnlyAffectedOwnerWhileFreeDigestAndRecoveredTelegramRemainCorrect() throws Exception {
   move("PRO",2);UUID paid=user;linked();
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());
   UUID id=listing();jdbc.update("UPDATE listings SET price=95 WHERE id=?",id);create(id);
   user=UUID.randomUUID();UUID free=user;move("STANDARD",1);create(id);user=paid;
   jdbc.update("DELETE FROM plan_entitlement_view WHERE plan_code='PRO' AND key='watch.immediate'");
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   Instant evening=Instant.now().atZone(ZoneId.of("Asia/Samarkand")).toLocalDate().plusDays(1).atTime(19,1).atZone(ZoneId.of("Asia/Samarkand")).toInstant();
   process(evening);process(evening);
   assertThat(notices()).as("missing grant cannot deliver paid in-app or create a Telegram claim").isZero();
   assertThat(jdbc.queryForObject("SELECT count(*) FROM watch_deliveries WHERE user_id=?",Integer.class,paid)).isZero();
   assertThat(jdbc.queryForObject("SELECT count(*) FROM notifications WHERE user_id=? AND type='WATCH_DIGEST'",Integer.class,free)).isEqualTo(1);
   plans.replacePlan("PRO",Map.of("watch.price_limit","20","watch.immediate","true"),System.nanoTime(),UUID.randomUUID().toString(),Instant.now());
   Config.bot.expect(requestTo("http://bot/bot/internal/watches/dm")).andRespond(withSuccess("{\"messageId\":993}",MediaType.APPLICATION_JSON));
   process(evening);process(evening);Config.bot.verify();assertThat(notices()).isEqualTo(1);
   JsonNode payload=json.readTree(jdbc.queryForObject("SELECT watch_payload::text FROM notifications WHERE user_id=?",String.class,paid));
   assertThat(payload.path("items").get(0).path("oldPrice").decimalValue()).as("pre-watch change stays baseline; only the later transition is delivered").isEqualByComparingTo("95");
   assertThat(payload.path("items").get(0).path("newPrice").decimalValue()).isEqualByComparingTo("90");
   assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE user_id=?",String.class,paid)).isEqualTo("SENT");
 }
 @Test void outageRecoveryStillEnforcesDowngradedQuotaBeforePriceDelivery() throws Exception {
   move("PRO",2);create(listing());create(listing());create(listing());UUID fourth=listing();create(fourth);
   jdbc.update("UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user' AND entity_id=?",user.toString());
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",fourth);process(Instant.now());assertThat(notices()).isZero();
   move("STANDARD",3);
   Instant evening=Instant.now().atZone(ZoneId.of("Asia/Samarkand")).toLocalDate().atTime(19,1).atZone(ZoneId.of("Asia/Samarkand")).toInstant();
   process(evening);assertThat(notices()).isZero();
   assertThat(jdbc.queryForObject("SELECT pause_reason FROM price_watches WHERE user_id=? AND listing_id=?",String.class,user,fourth)).isEqualTo("LIMIT");
 }
 @Test void createRechecksPolicyAfterWaitingForListingLock() throws Exception {
   for(String change:List.of("downgrade","stale")) {
     jdbc.update("DELETE FROM price_watches WHERE user_id=?",user);
     plans.userMoved(user,"PRO",null,System.nanoTime(),UUID.randomUUID().toString(),Instant.now());
     create(listing());create(listing());create(listing());UUID id=listing();
     var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
     var tx=new org.springframework.transaction.support.TransactionTemplate(context.getBean(org.springframework.transaction.PlatformTransactionManager.class));
     try(var pool=Executors.newFixedThreadPool(2)) {
       var holder=pool.submit(()->tx.executeWithoutResult(status->{
         jdbc.queryForObject("SELECT id FROM listings WHERE id=? FOR UPDATE",UUID.class,id);locked.countDown();
         try{assertThat(release.await(10,TimeUnit.SECONDS)).isTrue();}catch(InterruptedException failure){Thread.currentThread().interrupt();throw new IllegalStateException(failure);}
       }));
       assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
       var request=pool.submit(()->call(post("/api/v1/price-watches"),Map.of("listingId",id)).andReturn().getResponse().getStatus());
       try {
         org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).until(()->jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR SHARE%'",Long.class)>0);
         if(change.equals("downgrade"))plans.userMoved(user,"STANDARD",null,System.nanoTime(),UUID.randomUUID().toString(),Instant.now());
         else jdbc.update("UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user' AND entity_id=?",user.toString());
       } finally {release.countDown();}
       holder.get(10,TimeUnit.SECONDS);
       assertThat(request.get(10,TimeUnit.SECONDS)).as("%s during listing lock wait",change).isEqualTo(change.equals("downgrade")?409:503);
     }
     assertThat(jdbc.queryForObject("SELECT count(*) FROM price_watches WHERE user_id=?",Integer.class,user)).isEqualTo(3);
   }
 }
 @org.junit.jupiter.params.ParameterizedTest
 @org.junit.jupiter.params.provider.ValueSource(strings={"downgrade","stale"})
 void deliveryRechecksPolicyAfterWaitingForListingLock(String change) throws Exception {
   move("PRO",2);UUID id=listing();create(id);jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   var locked=new CountDownLatch(1);var release=new CountDownLatch(1);
   var tx=new org.springframework.transaction.support.TransactionTemplate(context.getBean(org.springframework.transaction.PlatformTransactionManager.class));
   Instant afternoon=Instant.now().atZone(ZoneId.of("Asia/Samarkand")).toLocalDate().plusDays(1).atTime(18,0).atZone(ZoneId.of("Asia/Samarkand")).toInstant();
   try(var pool=Executors.newFixedThreadPool(2)) {
     var holder=pool.submit(()->tx.executeWithoutResult(status->{
       jdbc.queryForObject("SELECT id FROM listings WHERE id=? FOR UPDATE",UUID.class,id);locked.countDown();
       try{assertThat(release.await(10,TimeUnit.SECONDS)).isTrue();}catch(InterruptedException failure){Thread.currentThread().interrupt();throw new IllegalStateException(failure);}
     }));
     assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
     var sweep=pool.submit(()->{process(afternoon);return null;});
     try {
       org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).until(()->jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR SHARE%'",Long.class)>0);
       if(change.equals("downgrade"))move("STANDARD",3);
       else jdbc.update("UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user' AND entity_id=?",user.toString());
     } finally {release.countDown();}
     holder.get(10,TimeUnit.SECONDS);sweep.get(10,TimeUnit.SECONDS);
   }
   assertThat(notices()).as("%s during delivery listing-lock wait cannot retain immediate Pro delivery",change).isZero();
   assertThat(jdbc.queryForObject("SELECT count(*) FROM watch_intents WHERE user_id=? AND state='PENDING'",Integer.class,user)).isEqualTo(1);
   move("PRO",4);process(afternoon);assertThat(notices()).isEqualTo(1);
 }
 @org.junit.jupiter.params.ParameterizedTest
 @org.junit.jupiter.params.provider.ValueSource(strings={"downgrade","stale"})
 void telegramRechecksPolicyAfterIdentityLookup(String change) throws Exception {
   move("PRO",2);linked();call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());
   when(identities.resolve(user)).thenReturn(Optional.empty());
   UUID id=listing();create(id);jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(Instant.now());
   when(identities.resolve(user)).thenAnswer(invocation->{
     if(change.equals("downgrade"))move("STANDARD",3);
     else jdbc.update("UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user' AND entity_id=?",user.toString());
     return Optional.of(new AuthSummaryClient.UserSummary(user,"User",null,123L,false,Instant.now(),false));
   });
   var requests=new java.util.concurrent.atomic.AtomicInteger();
   Config.bot.expect(org.springframework.test.web.client.ExpectedCount.between(0,1),requestTo("http://bot/bot/internal/watches/dm")).andExpect(request->requests.incrementAndGet()).andRespond(withSuccess("{\"messageId\":994}",MediaType.APPLICATION_JSON));
   process(Instant.now());Config.bot.verify();
   assertThat(requests.get()).as("%s while resolving identity cannot claim Telegram against old Pro policy",change).isZero();
   assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE user_id=?",String.class,user)).isEqualTo("PENDING");
 }
 @org.junit.jupiter.params.ParameterizedTest
 @org.junit.jupiter.params.provider.CsvSource({"false,false","true,false","false,true"})
 void delayedRenewalProjectionRetainsFirstPostRenewalPriceForLimitPausedWatch(boolean readBeforeSweep,boolean outsideRotationBatch) throws Exception {
   if(outsideRotationBatch)user=UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");
   move("PRO",2);create(listing());create(listing());create(listing());UUID id=listing();create(id);
   move("STANDARD",3);mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   assertThat(jdbc.queryForObject("SELECT pause_reason FROM price_watches WHERE user_id=? AND listing_id=?",String.class,user,id)).isEqualTo("LIMIT");
   jdbc.update("UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user' AND entity_id=?",user.toString());
   jdbc.update("UPDATE listings SET price=95 WHERE id=?",id);
   Instant renewal=jdbc.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class).toInstant();
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(Instant.now());assertThat(notices()).isZero();
   plans.userMoved(user,"PRO",Instant.now().plusSeconds(86400),4,UUID.randomUUID().toString(),renewal);
   if(readBeforeSweep)mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   if(outsideRotationBatch) {
     UUID dummyListing=listing();
     for(int i=1;i<=100;i++) {
       UUID dummy=UUID.fromString(String.format("00000000-0000-0000-0000-%012d",i));
       jdbc.update("INSERT INTO watch_preferences(user_id) VALUES(?)",dummy);
       jdbc.update("INSERT INTO price_watches(id,user_id,listing_id,priority,baseline_price_version) VALUES(?,?,?,0,0)",UUID.randomUUID(),dummy,dummyListing);
     }
   }
   process(Instant.now());process(Instant.now());assertThat(notices()).as("delayed renewal projection preserves its first later price transition").isEqualTo(1);
   JsonNode payload=json.readTree(jdbc.queryForObject("SELECT watch_payload::text FROM notifications WHERE user_id=?",String.class,user));
   assertThat(payload.path("items").get(0).path("oldPrice").decimalValue()).as("changes before the source renewal stay paused history").isEqualByComparingTo("95");
   assertThat(payload.path("items").get(0).path("newPrice").decimalValue()).isEqualByComparingTo("90");
 }
 @Test void explicitPrioritySelectionStartsFromCurrentPriceInsteadOfPausedHistory() throws Exception {
   move("PRO",2);List<UUID> order=new ArrayList<>();
   for(int i=0;i<4;i++)order.add(UUID.fromString(create(listing()).path("id").asText()));
   move("STANDARD",3);mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   UUID selected=order.removeLast();UUID listing=jdbc.queryForObject("SELECT listing_id FROM price_watches WHERE id=?",UUID.class,selected);
   jdbc.update("UPDATE listings SET price=95 WHERE id=?",listing);order.addFirst(selected);
   call(put("/api/v1/price-watches/priorities"),Map.of("ids",order)).andExpect(status().isOk());
   Instant evening=Instant.now().atZone(ZoneId.of("Asia/Samarkand")).toLocalDate().plusDays(1).atTime(19,1).atZone(ZoneId.of("Asia/Samarkand")).toInstant();
   process(evening);assertThat(notices()).as("explicit selection does not replay price changes while limit-paused").isZero();
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",listing);process(evening);assertThat(notices()).isEqualTo(1);
 }
 @org.junit.jupiter.params.ParameterizedTest
 @org.junit.jupiter.params.provider.CsvSource({"delete,false,false","delete,true,false","pause,false,false","pause,true,false","delete,false,true","delete,true,true","pause,false,true","pause,true,true"})
 void explicitRemovalPromotionDoesNotReplayLimitPausedPriceHistory(String operation,boolean readBeforeSweep,boolean unavailableDuringSelection) throws Exception {
   move("PRO",2);UUID first=UUID.fromString(create(listing()).path("id").asText());create(listing());create(listing());UUID id=listing();create(id);
   move("STANDARD",3);mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   Instant freeSource=jdbc.queryForObject("SELECT updated_at FROM user_plan_view WHERE user_id=?",java.sql.Timestamp.class,user).toInstant();
   jdbc.update("UPDATE listings SET price=95 WHERE id=?",id);
   if(unavailableDuringSelection)jdbc.update("UPDATE plan_projection_state SET occurred_at=now()-interval '25 hours' WHERE kind='user' AND entity_id=?",user.toString());
   if(operation.equals("delete"))mvc.perform(as(delete("/api/v1/price-watches/"+first),user)).andExpect(status().isNoContent());
   else call(patch("/api/v1/price-watches/"+first),Map.of("paused",true)).andExpect(status().isOk());
   if(unavailableDuringSelection)plans.userMoved(user,"STANDARD",null,4,UUID.randomUUID().toString(),freeSource);
   if(readBeforeSweep)mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   Instant evening=Instant.now().atZone(ZoneId.of("Asia/Samarkand")).toLocalDate().plusDays(1).atTime(19,1).atZone(ZoneId.of("Asia/Samarkand")).toInstant();
   process(evening);assertThat(notices()).as("%s promotes from current price, not limit-paused history",operation).isZero();
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(evening);assertThat(notices()).isEqualTo(1);
 }
 @Test void catalogBudgetIncreaseStartsAtGrantChangeInsteadOfOlderSubscription() throws Exception {
   move("PRO",2);create(listing());create(listing());create(listing());UUID id=listing();create(id);
   plans.replacePlan("PRO",Map.of("watch.price_limit","3","watch.immediate","true"),System.nanoTime(),UUID.randomUUID().toString(),Instant.now());
   mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   jdbc.update("UPDATE listings SET price=95 WHERE id=?",id);
   Instant grant=jdbc.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class).toInstant();
   plans.replacePlan("PRO",Map.of("watch.price_limit","4","watch.immediate","true"),System.nanoTime(),UUID.randomUUID().toString(),grant);
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(Instant.now());
   assertThat(notices()).isEqualTo(1);
   JsonNode payload=json.readTree(jdbc.queryForObject("SELECT watch_payload::text FROM notifications WHERE user_id=?",String.class,user));
   assertThat(payload.path("items").get(0).path("oldPrice").decimalValue()).as("catalog expansion does not replay prices from before the budget grant").isEqualByComparingTo("95");
   assertThat(payload.path("items").get(0).path("newPrice").decimalValue()).isEqualByComparingTo("90");
 }
 @Test void identicalRecoverySnapshotsCannotMoveRealRenewalBoundaryPastEligiblePrice() throws Exception {
   move("PRO",2);create(listing());create(listing());create(listing());UUID id=listing();create(id);
   move("STANDARD",3);mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   jdbc.update("UPDATE listings SET price=95 WHERE id=?",id);
   Instant renewal=jdbc.queryForObject("SELECT clock_timestamp()",java.sql.Timestamp.class).toInstant(),expiry=Instant.now().plusSeconds(86400);
   plans.userMoved(user,"PRO",expiry,4,UUID.randomUUID().toString(),renewal);
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   plans.replacePlan("PRO",Map.of("watch.price_limit","20","watch.immediate","true"),System.nanoTime(),UUID.randomUUID().toString(),Instant.now());
   plans.userMoved(user,"PRO",expiry,5,UUID.randomUUID().toString(),Instant.now());
   process(Instant.now());process(Instant.now());assertThat(notices()).as("hourly identical snapshots refresh readiness without resetting the real grant boundary").isEqualTo(1);
   JsonNode payload=json.readTree(jdbc.queryForObject("SELECT watch_payload::text FROM notifications WHERE user_id=?",String.class,user));
   assertThat(payload.path("items").get(0).path("oldPrice").decimalValue()).isEqualByComparingTo("95");
   assertThat(payload.path("items").get(0).path("newPrice").decimalValue()).isEqualByComparingTo("90");
 }
 @Test void dailyDigestCatchesMissedJobAndNeverSendsEmptyOrTwice() throws Exception {
   UUID a=listing(),b=listing();create(a);create(b);
   jdbc.update("UPDATE listings SET price=90 WHERE id IN (?,?)",a,b);
   Instant after=Instant.now().atZone(ZoneId.of("Asia/Samarkand")).toLocalDate().plusDays(3).atTime(19,1).atZone(ZoneId.of("Asia/Samarkand")).toInstant(); // downtime spanning daily schedules
   process(after);process(after);
   assertThat(notices()).isEqualTo(1);
   assertThat(jdbc.queryForObject("SELECT type FROM notifications WHERE user_id=?",String.class,user)).isEqualTo("WATCH_DIGEST");
   process(after.plusSeconds(86400));assertThat(notices()).isEqualTo(1);
 }
 @Test void freshOptOutSoldAndUnavailableEntitlementBlockQueuedDelivery() throws Exception {
   move("PRO",2); UUID id=listing();create(id);jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",false,"telegramEnabled",false)).andExpect(status().isOk());
   process(Instant.now());assertThat(notices()).isZero();
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",false)).andExpect(status().isOk());
   jdbc.update("UPDATE listings SET price=80,status='SOLD' WHERE id=?",id);process(Instant.now());assertThat(notices()).isZero();
   jdbc.update("UPDATE plan_projection_state SET occurred_at=now()-interval '2 days' WHERE kind='user' AND entity_id=?",user.toString());
   call(post("/api/v1/price-watches"),Map.of("listingId",listing())).andExpect(status().isServiceUnavailable());
   mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk()).andExpect(jsonPath("$.available").value(false));
 }
 @Test void disablingAllNotificationsDoesNotDependOnTelegramIdentityAvailability() throws Exception {
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",false,"telegramEnabled",true)).andExpect(status().isOk());
 }
 @Test void telegramOptInRequiresFreshLinkedIdentity() throws Exception {
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isServiceUnavailable());
 }
 @Test void freeDigestWaitsUntilNineteenEvenWhenYesterdayJobWasMissed() throws Exception {
   UUID id=listing();create(id);jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   jdbc.update("UPDATE watch_price_events SET occurred_at=now()-interval '2 days' WHERE listing_id=?",id);
   LocalDate today=Instant.now().atZone(ZoneId.of("Asia/Samarkand")).toLocalDate();
   process(today.atTime(18,59).atZone(ZoneId.of("Asia/Samarkand")).toInstant());assertThat(notices()).isZero();
   process(today.atTime(19,0).atZone(ZoneId.of("Asia/Samarkand")).toInstant());assertThat(notices()).isEqualTo(1);
 }
 @Test void resumeCancelsAlreadyMaterializedPriceIntent() throws Exception {
   move("PRO",2);UUID id=listing();String watch=create(id).path("id").asText();jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   jdbc.update("INSERT INTO watch_intents(id,user_id,listing_id,event_key,publication_version,reasons,old_price,new_price) VALUES(?,?,?,'price:1',1,?::jsonb,100,90)",UUID.randomUUID(),user,id,json.writeValueAsString(List.of(Map.of("watchId",watch,"label","Price"))));
   call(patch("/api/v1/price-watches/"+watch),Map.of("paused",true)).andExpect(status().isOk());
   call(patch("/api/v1/price-watches/"+watch),Map.of("paused",false)).andExpect(status().isOk());
   process(Instant.now());assertThat(notices()).isZero();
 }
 @Test void renewedLimitPausedWatchResumesWithoutOpeningPage() throws Exception {
   move("PRO",2);create(listing());create(listing());create(listing());UUID id=listing();create(id);
   move("STANDARD",3);mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());
   move("PRO",4);jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(Instant.now());assertThat(notices()).isEqualTo(1);
 }
 @Test void delayedProjectionCannotTreatPreOptInPublicationAsNewAfterOptIn() throws Exception {
   move("PRO",2);UUID id=listing();Instant published=Instant.now().minusSeconds(20);
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",false,"telegramEnabled",false)).andExpect(status().isOk());
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",false)).andExpect(status().isOk());
   accept(new WatchMessages.Candidate(UUID.randomUUID().toString(),UUID.randomUUID(),user,id,1L,published,List.of(new WatchMessages.Reason(UUID.randomUUID(),"Search")),Instant.now()));
   Config.rec.expect(requestTo("http://rec/internal/rec/v1/watches/authorize")).andRespond(withSuccess(auth(true),MediaType.APPLICATION_JSON));
   process(Instant.now());assertThat(notices()).isZero();
 }
 @Test void renewedOwnerOutsideRotationBatchStillGetsFirstNewPriceChange() throws Exception {
   user=UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");move("PRO",1);
   create(listing());create(listing());create(listing());UUID id=listing();create(id);
   move("STANDARD",2);mvc.perform(as(get("/api/v1/price-watches"),user)).andExpect(status().isOk());move("PRO",3);
   UUID dummyListing=listing();
   for(int i=1;i<=100;i++){
     UUID dummy=UUID.fromString(String.format("00000000-0000-0000-0000-%012d",i));
     jdbc.update("INSERT INTO watch_preferences(user_id) VALUES(?)",dummy);
     jdbc.update("INSERT INTO price_watches(id,user_id,listing_id,priority,baseline_price_version) VALUES(?,?,?,0,0)",UUID.randomUUID(),dummy,dummyListing);
   }
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(Instant.now());assertThat(notices()).isEqualTo(1);
 }
 @Test void delayedSearchCandidateBeforeGlobalOptInBoundaryNeverReleasesBacklog() throws Exception {
   move("PRO",2); UUID id=listing();Instant old=Instant.now().minusSeconds(10);
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",false,"telegramEnabled",false)).andExpect(status().isOk());
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",false)).andExpect(status().isOk());
   accept(candidate(id,old));
   Config.rec.expect(requestTo("http://rec/internal/rec/v1/watches/authorize")).andRespond(withSuccess(auth(true),MediaType.APPLICATION_JSON));
   process(Instant.now());assertThat(notices()).isZero();
 }
 @Test void searchAuthorizationUnavailableDefersWholeDigestAndReplayCombinesReasons() throws Exception {
   move("PRO",2); UUID id=listing();var candidate=candidate(id,Instant.now());accept(candidate);accept(candidate);
   Config.rec.expect(requestTo("http://rec/internal/rec/v1/watches/authorize")).andRespond(withServerError());
   process(Instant.now());assertThat(notices()).isZero();
   Config.rec.reset();Config.rec.expect(requestTo("http://rec/internal/rec/v1/watches/authorize")).andRespond(withSuccess(auth(true),MediaType.APPLICATION_JSON));
   process(Instant.now());process(Instant.now());assertThat(notices()).isEqualTo(1);
   JsonNode payload=json.readTree(jdbc.queryForObject("SELECT watch_payload::text FROM notifications WHERE user_id=?",String.class,user));
   assertThat(payload.path("items").get(0).path("reasons")).hasSize(2);
 }
 @Test void dailyDigestBoundsDisplayPayloadAndDoesNotReplayHiddenItems() throws Exception {
   for(int i=0;i<22;i++)accept(candidate(listing(),Instant.now()));
   Config.rec.expect(org.springframework.test.web.client.ExpectedCount.times(22),requestTo("http://rec/internal/rec/v1/watches/authorize")).andRespond(withSuccess(auth(true),MediaType.APPLICATION_JSON));
   Instant evening=Instant.now().atZone(ZoneId.of("Asia/Samarkand")).toLocalDate().atTime(19,1).atZone(ZoneId.of("Asia/Samarkand")).toInstant();
   process(evening);process(evening.plusSeconds(86400));Config.rec.verify();assertThat(notices()).isEqualTo(1);
   JsonNode payload=json.readTree(jdbc.queryForObject("SELECT watch_payload::text FROM notifications WHERE user_id=?",String.class,user));
   assertThat(payload.path("items")).hasSize(20);assertThat(payload.path("totalCount").asInt()).isEqualTo(22);assertThat(payload.path("remainingCount").asInt()).isEqualTo(2);
   assertThat(jdbc.queryForObject("SELECT count(*) FROM watch_intents WHERE user_id=? AND state='DELIVERED'",Integer.class,user)).isEqualTo(22);
 }
 @Test void searchFreshOptOutCancelsQueuedIntent() throws Exception {
   move("PRO",2);accept(candidate(listing(),Instant.now()));
   Config.rec.expect(requestTo("http://rec/internal/rec/v1/watches/authorize")).andRespond(withSuccess(auth(false),MediaType.APPLICATION_JSON));
   process(Instant.now());assertThat(notices()).isZero();
 }
 @Test void resumedPriceWatchIgnoresPausedHistory() throws Exception {
   move("PRO",2);UUID id=listing();String watch=create(id).path("id").asText();
   call(patch("/api/v1/price-watches/"+watch),Map.of("paused",true)).andExpect(status().isOk());
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   call(patch("/api/v1/price-watches/"+watch),Map.of("paused",false)).andExpect(status().isOk());
   process(Instant.now());assertThat(notices()).isZero();jdbc.update("UPDATE listings SET price=80 WHERE id=?",id);process(Instant.now());assertThat(notices()).isEqualTo(1);
 }
 @Test void telegramClaimCommitsBeforeCallAndUnknownResultNeverRetries() throws Exception {
   move("PRO",2);linked();call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());
   UUID id=listing();create(id);jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);
   Config.bot.expect(requestTo("http://bot/bot/internal/watches/dm")).andExpect(request->{assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE user_id=?",String.class,user)).isEqualTo("SENDING");})
      .andRespond(withException(new java.net.SocketTimeoutException("unknown remote outcome")));
   process(Instant.now());process(Instant.now());Config.bot.verify();assertThat(notices()).isEqualTo(1);
   assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE user_id=?",String.class,user)).isEqualTo("UNCONFIRMED");
 }
 @Test void unavailablePendingTelegramOwnersCannotStarveLaterHealthyOwner() throws Exception {
   move("PRO",2);linked();call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());
   when(identities.resolve(user)).thenReturn(Optional.empty());UUID id=listing();create(id);jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(Instant.now());
   UUID old=jdbc.queryForObject("SELECT id FROM watch_deliveries WHERE user_id=?",UUID.class,user),last=UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");
   jdbc.update("UPDATE watch_deliveries SET id=? WHERE id=?",last,old);jdbc.update("UPDATE watch_intents SET delivery_id=? WHERE delivery_id=?",last,old);
   for(int i=1;i<=100;i++){
     UUID dummy=UUID.fromString(String.format("00000000-0000-0000-0000-%012d",i));jdbc.update("INSERT INTO watch_preferences(user_id,telegram_enabled) VALUES(?,true)",dummy);
     jdbc.update("INSERT INTO watch_deliveries(id,user_id,payload,notification_id,created_at) VALUES(?,?,'{}',?,now()-interval '2 days')",dummy,dummy,UUID.randomUUID());
   }
   linked();Config.bot.expect(requestTo("http://bot/bot/internal/watches/dm")).andRespond(withSuccess("{\"messageId\":992}",MediaType.APPLICATION_JSON));
   process(Instant.now());process(Instant.now());Config.bot.verify();assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE id=?",String.class,last)).isEqualTo("SENT");
 }
 @Test void unavailablePendingInAppOwnersCannotStarveLaterHealthyOwner() throws Exception {
   user=UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");move("PRO",1);UUID listing=listing();create(listing);
   for(int i=1;i<=100;i++){
     UUID dummy=UUID.fromString(String.format("00000000-0000-0000-0000-%012d",i));
     jdbc.update("INSERT INTO watch_intents(id,user_id,listing_id,event_key,publication_version,reasons,created_at) VALUES(?,?,?,'publication:1',1,'[]',now()-interval '2 days')",UUID.randomUUID(),dummy,listing);
   }
   jdbc.update("UPDATE listings SET price=90 WHERE id=?",listing);process(Instant.now());process(Instant.now());assertThat(notices()).isEqualTo(1);
 }
 @Test void telegramCannotLockDeliveryAheadOfOwnerOptOutMutex() throws Exception {
   move("PRO",2);linked();call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());
   when(identities.resolve(user)).thenReturn(Optional.empty());UUID listing=listing();create(listing);jdbc.update("UPDATE listings SET price=90 WHERE id=?",listing);process(Instant.now());
   UUID delivery=jdbc.queryForObject("SELECT id FROM watch_deliveries WHERE user_id=?",UUID.class,user);
   var method=WatchDeliveryWorkflow.class.getDeclaredMethod("telegram",UUID.class);method.setAccessible(true);
   var acquired=new java.util.concurrent.atomic.AtomicBoolean();var future=new java.util.concurrent.atomic.AtomicReference<Future<?>>();
   try(var pool=Executors.newSingleThreadExecutor()) {
     var transaction=new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
     transaction.executeWithoutResult(status->{
       jdbc.queryForObject("SELECT user_id FROM watch_preferences WHERE user_id=? FOR UPDATE",UUID.class,user);
       future.set(pool.submit(()->{try{method.invoke(context.getBean(WatchDeliveryWorkflow.class),delivery);}catch(Exception e){throw new RuntimeException(e);}}));
       org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).until(()->jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT user_id FROM watch_preferences%'",Integer.class)>0);
       try{jdbc.queryForObject("SELECT id FROM watch_deliveries WHERE id=? FOR UPDATE NOWAIT",UUID.class,delivery);acquired.set(true);}catch(org.springframework.dao.DataAccessException expected){acquired.set(false);}
       status.setRollbackOnly();
     });
     future.get().get(10,TimeUnit.SECONDS);
   }
   assertThat(acquired.get()).as("owner opt-out can acquire its delivery rows without deadlocking a Telegram claim").isTrue();
 }
 @Test void freshTelegramClaimIsNotAgedByOldPendingDeliveryCreationTime() throws Exception {
   move("PRO",2);linked();call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());
   when(identities.resolve(user)).thenReturn(Optional.empty());UUID id=listing();create(id);jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(Instant.now());
   jdbc.update("UPDATE watch_deliveries SET created_at=now()-interval '2 days' WHERE user_id=?",user);linked();
   Config.bot.expect(requestTo("http://bot/bot/internal/watches/dm")).andExpect(request->{context.getBean(WatchDeliveryWorkflow.class).process(Instant.now());
      assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE user_id=?",String.class,user)).isEqualTo("SENDING");})
      .andRespond(withSuccess("{\"messageId\":991}",MediaType.APPLICATION_JSON));
   process(Instant.now());Config.bot.verify();assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE user_id=?",String.class,user)).isEqualTo("SENT");
 }
 @Test void globalOptOutCancelsPendingTelegramEvenWhenReenabled() throws Exception {
   move("PRO",2);linked();call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());
   when(identities.resolve(user)).thenReturn(Optional.empty());UUID id=listing();accept(candidate(id,Instant.now()));
   Config.rec.expect(requestTo("http://rec/internal/rec/v1/watches/authorize")).andRespond(withSuccess(auth(true),MediaType.APPLICATION_JSON));process(Instant.now());
   Config.rec.reset();Config.rec.expect(requestTo("http://rec/internal/rec/v1/watches/authorize")).andRespond(withSuccess(auth(true),MediaType.APPLICATION_JSON));
   call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",false,"telegramEnabled",false)).andExpect(status().isOk());
   linked();call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());process(Instant.now());
   assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE user_id=?",String.class,user)).isEqualTo("SKIPPED");Config.bot.verify();
 }
 @Test void telegramRechecksPausedWatchAfterInAppCommit() throws Exception {
   move("PRO",2);linked();call(put("/api/v1/price-watches/preferences"),Map.of("notificationsEnabled",true,"telegramEnabled",true)).andExpect(status().isOk());
   when(identities.resolve(user)).thenReturn(Optional.empty());
   UUID id=listing();String watch=create(id).path("id").asText();jdbc.update("UPDATE listings SET price=90 WHERE id=?",id);process(Instant.now());
   call(patch("/api/v1/price-watches/"+watch),Map.of("paused",true)).andExpect(status().isOk());linked();process(Instant.now());
   assertThat(jdbc.queryForObject("SELECT telegram_state FROM watch_deliveries WHERE user_id=?",String.class,user)).isEqualTo("SKIPPED");Config.bot.verify();
 }
 void linked(){doNothing().when(identities).requireTelegramLinked(user);when(identities.resolve(user)).thenReturn(Optional.of(new AuthSummaryClient.UserSummary(user,"User",null,123L,false,Instant.now(),false)));}
 WatchMessages.Candidate candidate(UUID listing,Instant occurred){return new WatchMessages.Candidate(UUID.randomUUID().toString(),UUID.randomUUID(),user,listing,1L,Instant.now().minusSeconds(20),List.of(new WatchMessages.Reason(UUID.randomUUID(),"Search")),occurred);}
 String auth(boolean eligible){return "{\"eligible\":"+eligible+",\"deliveryMode\":\"IMMEDIATE\",\"reasons\":[{\"watchId\":\""+UUID.randomUUID()+"\",\"label\":\"Messi\"},{\"watchId\":\""+UUID.randomUUID()+"\",\"label\":\"Budget\"}]}";}
 void accept(WatchMessages.Candidate candidate){context.getBean(WatchDeliveryWorkflow.class).accept(candidate);}
 long notices(){return jdbc.queryForObject("SELECT count(*) FROM notifications WHERE user_id=?",Long.class,user);}
 void process(Instant now) throws Exception {Object flow=context.getBean(Class.forName("uz.efbazaar.marketplace.pricewatch.WatchDeliveryWorkflow"));flow.getClass().getMethod("process",Instant.class).invoke(flow,now);}
 void move(String plan,long version){plans.userMoved(user,plan,plan.equals("STANDARD")?null:Instant.now().plusSeconds(86400),version,UUID.randomUUID().toString(),Instant.now());}
 UUID listing(){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO listings(id,seller_id,description,price,status,created_at,updated_at) VALUES (?,?,'test',100,'ACTIVE',now(),now())",id,UUID.randomUUID());return id;}
 JsonNode create(UUID id)throws Exception{return read(call(post("/api/v1/price-watches"),Map.of("listingId",id)).andExpect(status().isCreated()));}
 ResultActions call(MockHttpServletRequestBuilder r,Object body)throws Exception{return mvc.perform(as(r,user).contentType("application/json").content(json.writeValueAsString(body)));}
 JsonNode read(ResultActions r)throws Exception{return json.readTree(r.andReturn().getResponse().getContentAsString());}
 MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder r,UUID id){return r.accept("application/json").header("X-User-Id",id).header("X-User-Roles","ROLE_USER");}
 @Configuration @EnableWebMvc @EnableTransactionManagement
 @ComponentScan(value="uz.efbazaar.marketplace.pricewatch",excludeFilters=@ComponentScan.Filter(type=FilterType.REGEX,pattern=".*WatchClientConfig"))
 @Import({SecurityConfig.class,HeaderAuthenticationFilter.class,InternalSecretFilter.class,GlobalExceptionHandler.class,PlanProjection.class,PlanCapabilities.class})
 static class Config {
   @Bean DataSource dataSource(){var ds=new DriverManagerDataSource(postgres.getJdbcUrl(),postgres.getUsername(),postgres.getPassword());Flyway.configure().dataSource(ds).load().migrate();return ds;}
   @Bean JdbcTemplate marketplaceJdbcTemplate(DataSource ds){return new JdbcTemplate(ds);}
   @Bean DataSourceTransactionManager transactionManager(DataSource ds){return new DataSourceTransactionManager(ds);}
   @Bean ObjectMapper objectMapper(){return new ObjectMapper().findAndRegisterModules();}
   @Bean AuthSummaryClient authSummaryClient(){return mock(AuthSummaryClient.class);}
   static MockRestServiceServer rec,bot;
   @Bean RestClient watchRecommendationClient(){var builder=RestClient.builder().baseUrl("http://rec");rec=MockRestServiceServer.bindTo(builder).build();return builder.build();}
   @Bean RestClient watchBotClient(){var builder=RestClient.builder().baseUrl("http://bot");bot=MockRestServiceServer.bindTo(builder).build();return builder.build();}
 }
}
