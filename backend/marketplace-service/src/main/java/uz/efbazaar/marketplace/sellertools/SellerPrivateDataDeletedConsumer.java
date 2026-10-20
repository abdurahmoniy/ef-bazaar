package uz.efbazaar.marketplace.sellertools;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.kafka.UserDeletedDto;

/** Explicit account deletion is distinct from subscription expiry: expiry erases nothing. */
@Component
@RequiredArgsConstructor
public class SellerPrivateDataDeletedConsumer
    implements java.util.function.Consumer<UserDeletedDto> {
  private final JdbcTemplate jdbc;

  @Override
  @Transactional
  @KafkaListener(
      topics = "efbazaar.auth.user-deleted",
      groupId = "marketplace-private-data-deleted",
      properties = {
        "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.UserDeletedDto",
        "spring.json.use.type.headers=false"
      })
  public void accept(UserDeletedDto event) {
    jdbc.update("DELETE FROM seller_reply_templates WHERE owner_id=?", event.userId());
    jdbc.update("DELETE FROM seller_private_notes WHERE owner_id=?", event.userId());
    jdbc.update("DELETE FROM profile_appearances WHERE user_id=?", event.userId());
  }
}
