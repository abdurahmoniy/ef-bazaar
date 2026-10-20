package uz.efbazaar.recommendation.watch;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import uz.efbazaar.recommendation.plan.PlanCapabilities;
import uz.efbazaar.recommendation.plan.PlanProjection;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@JdbcTest
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
@Import({PlanCapabilities.class,PlanProjection.class,SavedSearchService.class,uz.efbazaar.recommendation.match.MatchRequestParser.class,uz.efbazaar.recommendation.match.CardIdentityVerifier.class,uz.efbazaar.recommendation.match.MatchEngine.class})
class WatchCapabilitiesIT {
    @Container @ServiceConnection static PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:16-alpine");
    @Autowired PlanProjection projection;
    @org.springframework.boot.test.mock.mockito.SpyBean PlanCapabilities capabilities;
    @Autowired SavedSearchService searches;
    final List<String> keys=List.of("watch.search_limit","watch.immediate");
    @Test void concurrentDowngradeCannotMixProLimitWithFreeDeliveryMode() {
        UUID user=UUID.randomUUID(); Instant now=Instant.now();
        projection.replacePlan("STANDARD",Map.of("watch.search_limit","1","watch.immediate","false"),1,"atomic-free",now);
        projection.replacePlan("PRO",Map.of("watch.search_limit","5","watch.immediate","true"),1,"atomic-pro",now);
        projection.userMoved(user,"PRO",now.plusSeconds(60),1,"atomic-user-pro",now);
        org.mockito.Mockito.doAnswer(invocation->{
            var result=invocation.callRealMethod();
            projection.userMoved(user,"STANDARD",null,2,"atomic-user-free",now);
            return result;
        }).when(capabilities).capability(user,"watch.search_limit");
        var listing=searches.list(user);
        assertThat(listing.limit()+":"+listing.immediate()).isIn("5:true","1:false");
    }
    @Test void limitsAndTimingBelongToOneEffectivePlanSnapshot() {
        UUID user=UUID.randomUUID(); Instant now=Instant.now();
        projection.replacePlan("STANDARD",Map.of("watch.search_limit","1","watch.immediate","false"),1,"watch-free",now);
        projection.replacePlan("PRO",Map.of("watch.search_limit","5","watch.immediate","true"),1,"watch-pro",now);
        projection.userMoved(user,"PRO",now.plusSeconds(60),1,"watch-user-pro",now);
        var pro=capabilities.capabilities(user,keys);
        assertThat(pro.get(keys.getFirst()).value()).isEqualTo("5");
        assertThat(pro.get(keys.get(1)).value()).isEqualTo("true");
        projection.userMoved(user,"STANDARD",null,2,"watch-user-free",now);
        var free=capabilities.capabilities(user,keys);
        assertThat(free.get(keys.getFirst()).value()).isEqualTo("1");
        assertThat(free.get(keys.get(1)).value()).isEqualTo("false");
        projection.userMoved(user,"PRO",now.plusSeconds(60),3,"watch-user-stale",now.minusSeconds(90000));
        assertThat(capabilities.capabilities(user,keys).values()).allSatisfy(value->
                assertThat(value.status()).isEqualTo(PlanCapabilities.Status.UNAVAILABLE));
    }
}
