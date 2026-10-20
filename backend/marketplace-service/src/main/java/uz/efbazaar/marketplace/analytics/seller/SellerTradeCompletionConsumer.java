package uz.efbazaar.marketplace.analytics.seller;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class SellerTradeCompletionConsumer {
  private final ObjectMapper mapper;
  private final JdbcTemplate jdbc;

  public record Completed(
      String idempotencyKey,
      UUID tradeId,
      UUID listingId,
      UUID sellerId,
      UUID buyerId,
      String kind,
      String mode,
      Long priceUzs,
      Instant completedAt) {}

  @KafkaListener(
      topics = "efbazaar.trade.seller-trade-completed",
      groupId = "marketplace-service-seller-completions",
      properties = {
        "value.deserializer=org.apache.kafka.common.serialization.StringDeserializer",
        "auto.offset.reset=earliest",
        "spring.json.use.type.headers=false"
      })
  @Transactional
  public void onCompleted(String json) throws Exception {
    var raw = mapper.readTree(json);
    var amount = raw == null ? null : raw.get("priceUzs");
    if (amount == null || !amount.isIntegralNumber() || !amount.canConvertToLong()) {
      throw new IllegalArgumentException("Invalid completion source amount");
    }
    Completed e = mapper.treeToValue(raw, Completed.class);
    if (e == null
        || e.tradeId() == null
        || e.listingId() == null
        || e.sellerId() == null
        || e.buyerId() == null
        || e.sellerId().equals(e.buyerId())
        || !("seller-trade-completed:" + e.tradeId()).equals(e.idempotencyKey())
        || !Set.of("SALE", "SWAP", "SWAP_SURCHARGE").contains(Objects.toString(e.kind(), ""))
        || !Set.of("SMART", "HUMAN").contains(Objects.toString(e.mode(), ""))
        || e.priceUzs() == null
        || e.priceUzs() < 0
        || e.completedAt() == null
        || e.completedAt().isAfter(Instant.now().plusSeconds(60)))
      throw new IllegalArgumentException("Invalid seller completion fact");
    jdbc.update(
        "INSERT INTO"
            + " seller_analytics_trade_receipts(trade_id,idempotency_key,listing_id,seller_id,kind,mode,price_uzs,completed_at)"
            + " VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
        e.tradeId(),
        e.idempotencyKey(),
        e.listingId(),
        e.sellerId(),
        e.kind(),
        e.mode(),
        e.priceUzs(),
        Timestamp.from(e.completedAt()));
    applyPending();
  }

  @Scheduled(fixedDelayString = "${analytics.completions.retry-ms:30000}")
  @Transactional
  public void retryPending() {
    applyPending();
  }

  private void applyPending() {
    // Row locking serializes receipt, fact and rollup. Missing listings stay durable.
    var ids =
        jdbc.query(
            """
SELECT r.trade_id FROM seller_analytics_trade_receipts r
WHERE r.applied_at IS NULL AND (
  r.completed_at<(SELECT started_at FROM seller_analytics_collection)
  OR EXISTS(SELECT 1 FROM listings l WHERE l.id=r.listing_id AND l.seller_id=r.seller_id))
ORDER BY r.completed_at LIMIT 100 FOR UPDATE OF r SKIP LOCKED
""",
            (rs, n) -> rs.getObject(1, UUID.class));
    for (UUID id : ids) {
      jdbc.update(
          """
INSERT INTO seller_analytics_facts(source_key,listing_id,seller_id,metric,occurred_at,gross_sales_uzs)
SELECT r.idempotency_key,r.listing_id,r.seller_id,'TRADE',r.completed_at,CASE WHEN r.kind='SALE' THEN r.price_uzs ELSE 0 END
FROM seller_analytics_trade_receipts r JOIN listings l ON l.id=r.listing_id AND l.seller_id=r.seller_id
WHERE r.trade_id=? AND r.completed_at>=(SELECT started_at FROM seller_analytics_collection) ON CONFLICT DO NOTHING
""",
          id);
      jdbc.update(
          "UPDATE seller_analytics_trade_receipts r SET applied_at=clock_timestamp() WHERE"
              + " trade_id=? AND (EXISTS(SELECT 1 FROM seller_analytics_facts f WHERE"
              + " f.source_key=r.idempotency_key) OR r.completed_at<(SELECT started_at FROM"
              + " seller_analytics_collection))",
          id);
    }
  }
}
