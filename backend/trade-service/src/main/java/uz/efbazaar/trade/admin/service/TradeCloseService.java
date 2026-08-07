package uz.efbazaar.trade.admin.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.dto.CloseConfirmResponse;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeChatService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Closing a human trade.
 *
 * <p>The admin may only close at 6/6 — the checklist is the record the parties
 * are asked to confirm. Confirmation is two independent timestamps rather than
 * a state, so there is no "half-confirmed" state to reason about; the
 * transition fires when the second one lands.
 */
@Service
@RequiredArgsConstructor
public class TradeCloseService {

    private final TradeRepository trades;
    private final TradeService tradeService;
    private final TradeStepService steps;
    private final TradeChatService chatService;
    private final TradeAuditService audit;

    @Transactional
    public void adminClose(UUID adminId, UUID tradeId) {
        Trade t = requireAssignedAdmin(tradeId, adminId);
        if (t.getState() != TradeState.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo yopishga tayyor emas");
        }
        if (!steps.allComplete(tradeId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Barcha %d qadam belgilanmaguncha savdo yopilmaydi (%d/%d)".formatted(
                            TradeStep.values().length,
                            steps.completedCount(tradeId),
                            TradeStep.values().length));
        }

        tradeService.transition(tradeId, TradeEvent.ADMIN_CLOSED,
                ActorType.TRADE_ADMIN, adminId);

        chatService.postStatusToBoth(tradeId, "ADMIN_CLOSED", Map.of(
                "adminId", adminId.toString()));
    }

    @Transactional
    public void adminCancel(UUID adminId, UUID tradeId, String reason) {
        Trade t = requireAssignedAdmin(tradeId, adminId);
        if (t.getState() != TradeState.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdoni hozir bekor qilolmaysiz");
        }

        audit.record(tradeId, ActorType.TRADE_ADMIN, adminId, "ADMIN_CANCELLED",
                Map.of("reason", reason == null ? "" : reason));
        chatService.postStatusToBoth(tradeId, "ADMIN_CANCELLED", Map.of(
                "reason", reason == null ? "" : reason));

        // Handler rotates the mailbox, returns it to the seller and records the
        // cancellation against the admin.
        tradeService.transition(tradeId, TradeEvent.ADMIN_CANCELLED,
                ActorType.TRADE_ADMIN, adminId);
    }

    /**
     * One party confirms the trade finished. Fires {@code CLOSE_CONFIRMED} only
     * once both have. Idempotent per party.
     *
     * <p>Deliberately does NOT call {@link TradeService#get} first to check
     * party membership: that would load the same Trade row into this
     * transaction's persistence context before {@link
     * TradeRepository#findByIdForUpdate} runs. Hibernate's identity map wins
     * for entity queries — a second, differently-locked query for an
     * already-managed entity returns the very same (by-then stale) instance
     * rather than one hydrated from its own ResultSet. Under a genuine race
     * that silently defeats the pessimistic lock: the blocked call's SELECT
     * still waits for the first transaction to commit, but once unblocked it
     * hands back the pre-lock snapshot instead of the first caller's
     * committed timestamp, so CLOSE_CONFIRMED never fires. The fix is to make
     * the locked read the *first* read of this row in the transaction.
     */
    @Transactional
    public CloseConfirmResponse confirm(UUID partyUserId, UUID tradeId) {
        Trade t = trades.findByIdForUpdate(tradeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        // Party-only: excludes the admin, which is exactly right — the admin
        // must not be able to confirm on anybody's behalf. Same semantics as
        // TradeService.get(), reimplemented here to keep the locked query the
        // sole load of this row.
        if (!t.isParticipant(partyUserId)) {
            throw new EntityNotFoundException("Trade " + tradeId);
        }
        if (t.getState() != TradeState.WAITING_CLOSE_CONFIRM) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo tasdiqlash holatida emas");
        }

        ParticipantRole role = t.roleFor(partyUserId);
        boolean changed = false;
        if (role == ParticipantRole.SELLER && t.getSellerConfirmedAt() == null) {
            t.setSellerConfirmedAt(Instant.now());
            changed = true;
        } else if (role == ParticipantRole.BUYER && t.getBuyerConfirmedAt() == null) {
            t.setBuyerConfirmedAt(Instant.now());
            changed = true;
        }
        if (changed) {
            trades.save(t);
            audit.record(tradeId, ActorType.USER, partyUserId, "CLOSE_CONFIRMED_BY",
                    Map.of("role", role.name()));
            chatService.postStatusToBoth(tradeId, "PARTY_CONFIRMED",
                    Map.of("role", role.name()));
        }

        boolean sellerOk = t.getSellerConfirmedAt() != null;
        boolean buyerOk  = t.getBuyerConfirmedAt() != null;

        if (sellerOk && buyerOk) {
            Trade done = tradeService.transition(tradeId, TradeEvent.CLOSE_CONFIRMED,
                    ActorType.SYSTEM, null);
            return new CloseConfirmResponse(true, true, done.getState());
        }
        return new CloseConfirmResponse(sellerOk, buyerOk, t.getState());
    }

    private Trade requireAssignedAdmin(UUID tradeId, UUID adminId) {
        Trade t = trades.findByIdAndViewer(tradeId, adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (!adminId.equals(t.getAssignedAdminId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Bu savdo sizga biriktirilmagan");
        }
        return t;
    }
}
