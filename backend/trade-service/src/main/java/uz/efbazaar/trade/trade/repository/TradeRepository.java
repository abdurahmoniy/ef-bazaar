package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

public interface TradeRepository extends JpaRepository<Trade, UUID> {

    @Query("""
            SELECT t FROM Trade t
             WHERE t.id = :id
               AND (t.sellerId = :userId OR t.buyerId = :userId)
            """)
    Optional<Trade> findByIdAndParticipant(@Param("id") UUID id,
                                           @Param("userId") UUID userId);

    @Query("""
            SELECT t FROM Trade t
             WHERE t.chatId = :chatId
               AND (t.sellerId = :userId OR t.buyerId = :userId)
             ORDER BY t.createdAt DESC
            """)
    List<Trade> findByChatIdAndParticipantOrderByCreatedAtDesc(@Param("chatId") UUID chatId,
                                                               @Param("userId") UUID userId);

    List<Trade> findByStateInAndStateDeadlineBefore(Set<TradeState> states,
                                                    Instant cutoff);

    Optional<Trade> findByMailboxId(UUID mailboxId);
}
