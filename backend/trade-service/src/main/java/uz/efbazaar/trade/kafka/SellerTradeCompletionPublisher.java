package uz.efbazaar.trade.kafka;

import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.outbox.Outbox;
import uz.efbazaar.trade.trade.domain.Trade;

@Component
@RequiredArgsConstructor
public class SellerTradeCompletionPublisher {
  public static final String TOPIC = "efbazaar.trade.seller-trade-completed";
  private final JdbcTemplate jdbc;
  private final Outbox outbox;

  public record Completed(
      String idempotencyKey,
      UUID tradeId,
      UUID listingId,
      UUID sellerId,
      UUID buyerId,
      String kind,
      String mode,
      long priceUzs,
      Instant completedAt) {}

  @Transactional(propagation = Propagation.MANDATORY)
  public void completed(Trade trade) {
    if (trade.getListingId() == null) return;
    Instant at =
        jdbc.query(
            "INSERT INTO seller_trade_completions(trade_id,completed_at) VALUES"
                + " (?,clock_timestamp()) ON CONFLICT DO NOTHING RETURNING completed_at",
            rs -> rs.next() ? rs.getTimestamp(1).toInstant() : null,
            trade.getId());
    if (at == null) return;
    outbox.publish(
        TOPIC,
        trade.getId().toString(),
        new Completed(
            "seller-trade-completed:" + trade.getId(),
            trade.getId(),
            trade.getListingId(),
            trade.getSellerId(),
            trade.getBuyerId(),
            trade.getKind().name(),
            trade.getMode().name(),
            trade.getPriceUzs(),
            at));
  }
}
