package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.trade.domain.TradeMessage;

import java.util.List;
import java.util.UUID;

public interface TradeMessageRepository extends JpaRepository<TradeMessage, UUID> {

    List<TradeMessage> findByTradeChatIdOrderByCreatedAtAsc(UUID tradeChatId);
}
