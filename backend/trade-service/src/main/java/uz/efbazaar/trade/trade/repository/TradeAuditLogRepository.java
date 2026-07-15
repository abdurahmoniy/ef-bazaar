package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.trade.domain.TradeAuditLog;

import java.util.List;
import java.util.UUID;

public interface TradeAuditLogRepository extends JpaRepository<TradeAuditLog, Long> {

    List<TradeAuditLog> findByTradeIdOrderByCreatedAtAsc(UUID tradeId);
}
