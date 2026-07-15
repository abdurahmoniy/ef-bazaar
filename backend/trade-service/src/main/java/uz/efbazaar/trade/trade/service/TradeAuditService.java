package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeAuditLog;
import uz.efbazaar.trade.trade.repository.TradeAuditLogRepository;

import java.util.Map;
import java.util.UUID;

/**
 * The only sanctioned way to write to trade_audit_log.
 * No delete or update methods — this class is intentionally minimal.
 */
@Service
@RequiredArgsConstructor
public class TradeAuditService {

    private final TradeAuditLogRepository repo;

    @Transactional
    public void record(UUID tradeId,
                       ActorType actorType,
                       UUID actorId,
                       String action,
                       Map<String, Object> metadata) {
        repo.save(TradeAuditLog.builder()
                .tradeId(tradeId)
                .actorType(actorType)
                .actorId(actorId)
                .action(action)
                .metadata(metadata)
                .build());
    }
}
