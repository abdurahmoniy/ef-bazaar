package uz.efbazaar.recommendation.plan;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.Test;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;
class SubscriptionHistoryWireTest {
 @Test void paidHistoryIsAcceptedButDoesNotBecomeAnEffectiveExpiry() throws Exception {
  var mapper = new ObjectMapper().registerModule(new JavaTimeModule());
  var event = mapper.readValue("""
   {"userId":"00000000-0000-0000-0000-000000000001","planCode":"STANDARD","expiresAt":null,
    "occurredAt":"2026-10-19T00:00:00Z","version":30,"idempotencyKey":"history",
    "lastPaidExpiresAt":"2026-10-18T00:00:00Z"}
   """, PlanEvents.SubscriptionChanged.class);
  assertEquals("STANDARD",event.planCode()); assertNull(event.expiresAt());
 }
}
