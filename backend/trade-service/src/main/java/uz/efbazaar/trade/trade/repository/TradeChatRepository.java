package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeChat;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeChatRepository extends JpaRepository<TradeChat, UUID> {

    Optional<TradeChat> findByTradeIdAndParticipant(UUID tradeId, ParticipantRole participant);

    List<TradeChat> findByTradeId(UUID tradeId);
}
