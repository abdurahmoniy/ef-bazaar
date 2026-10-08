package uz.efbazaar.trade.trade.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeSide;
import uz.efbazaar.trade.trade.domain.TradeSideId;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TradeSideRepository extends JpaRepository<TradeSide, TradeSideId> {

    List<TradeSide> findByIdTradeId(UUID tradeId);

    /**
     * Writes only the code, in one statement.
     *
     * <p>Not a read-mutate-save: the code arrives from the worker while the
     * party may be pressing "email changed" in the same second, and saving a
     * whole row read before that click would undo it — the same lost update
     * that reverted the trade's own state.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE TradeSide s
               SET s.emailChangeCode = :code,
                   s.emailChangeCodeAt = :receivedAt
             WHERE s.id.tradeId = :tradeId AND s.id.role = :role
               AND (s.emailChangeCodeAt IS NULL OR s.emailChangeCodeAt < :receivedAt)
            """)
    int recordEmailChangeCode(@Param("tradeId") UUID tradeId,
                              @Param("role") ParticipantRole role,
                              @Param("code") String code,
                              @Param("receivedAt") Instant receivedAt);

    /**
     * Kirish kodini yozadi — {@link #recordEmailChangeCode} bilan bir xil
     * sababdan bitta UPDATE bilan: kod worker'dan kelayotganda taraf o'sha
     * soniyada tasdiqlash tugmasini bosayotgan bo'lishi mumkin.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            UPDATE TradeSide s
               SET s.loginCode = :code,
                   s.loginCodeAt = :receivedAt
             WHERE s.id.tradeId = :tradeId AND s.id.role = :role
               AND (s.loginCodeAt IS NULL OR s.loginCodeAt < :receivedAt)
            """)
    int recordLoginCode(@Param("tradeId") UUID tradeId,
                        @Param("role") ParticipantRole role,
                        @Param("code") String code,
                        @Param("receivedAt") Instant receivedAt);

    default Optional<TradeSide> find(UUID tradeId, ParticipantRole role) {
        return findById(new TradeSideId(tradeId, role));
    }
}
