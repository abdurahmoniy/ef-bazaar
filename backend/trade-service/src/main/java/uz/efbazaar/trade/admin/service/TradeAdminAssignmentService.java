package uz.efbazaar.trade.admin.service;

import lombok.RequiredArgsConstructor;
import uz.efbazaar.trade.kafka.ChatChangePublisher;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.domain.TradeStepMark;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.repository.TradeStepMarkRepository;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeChatService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Hiring lifecycle: invite → accept or decline → (on decline) invite again.
 *
 * <p>Capacity binds on ACCEPT, not on invitation. An invitation is not a
 * reservation, so two sellers may invite the same admin at once; the loser
 * finds out when they try to accept and their trade stays hireable.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TradeAdminAssignmentService {

    private final TradeRepository trades;
    private final TradeService tradeService;
    private final TradeAdminProfileRepository profiles;
    private final TradeAdminProfileService profileService;
    private final TradeStepMarkRepository steps;
    private final TradeChatService chatService;
    private final TradeEventPublisher events;
    private final ChatChangePublisher changes;

    /**
     * Same knob {@code TradeStateHandler} uses to arm {@code WAITING_ADMIN} on
     * a fresh entry or a decline self-loop. {@code assign()} is not a state
     * transition, so it has to re-arm the deadline itself using the identical
     * window — otherwise a re-invite inherits whatever was left on the clock
     * from the previous admin's decline instead of a full response window.
     */
    @Value("${trade.timeouts.human-waiting-admin-seconds}")
    private long humanWaitingAdminSeconds;

    @Transactional
    public void accept(UUID adminId, UUID tradeId) {
        Trade t = requireInvited(adminId, tradeId);

        // Trade first, then profile — the order every path has to take.
        // TradeService.transition locks the trade and its onEnter writes the
        // admin's profile through TradeAdminStats, so locking the profile first
        // here and the trade second would be the opposite order and the two
        // could sit waiting on each other.
        trades.findByIdForUpdate(tradeId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Savdo topilmadi"));

        // Lock the profile so two concurrent accepts serialise on this row.
        TradeAdminProfile p = profiles.findByIdForUpdate(adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN,
                        "Savdo admini profili topilmadi"));
        if (!p.isActive()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Siz endi savdo admini emassiz");
        }
        int active = trades.countActiveByAdmin(adminId);
        if (active >= p.getMaxConcurrentTrades()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bir vaqtda %d savdodan ko'p olib borolmaysiz".formatted(
                            p.getMaxConcurrentTrades()));
        }

        // Moves to IN_PROGRESS, sets adminAcceptedAt, nulls stateDeadline,
        // arms the escalation watchdog and hands the mailbox to the admin.
        tradeService.transition(tradeId, TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, adminId);

        createChecklist(tradeId);

        chatService.postStatusToBoth(tradeId, "ADMIN_ACCEPTED", Map.of(
                "adminId", adminId.toString(),
                "feeUzs", String.valueOf(t.getAdminFeeUzs())));

        log.info("Trade {} accepted by admin {} ({}/{} slots used)",
                tradeId, adminId, active + 1, p.getMaxConcurrentTrades());
    }

    @Transactional
    public void decline(UUID adminId, UUID tradeId) {
        requireInvited(adminId, tradeId);

        tradeService.transition(tradeId, TradeEvent.ADMIN_DECLINED,
                ActorType.TRADE_ADMIN, adminId);

        chatService.postStatus(tradeId, ParticipantRole.SELLER, "ADMIN_DECLINED",
                Map.of("adminId", adminId.toString()));
    }

    /**
     * Seller invites (or re-invites) an admin while the trade sits in
     * {@code WAITING_ADMIN}. Not a state transition — the state does not
     * change, so this writes the assignment and re-arms the deadline itself.
     */
    @Transactional
    public void assign(UUID sellerId, UUID tradeId, UUID adminId, long feeUzs) {
        Trade t = trades.findById(tradeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (!sellerId.equals(t.getSellerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Adminni faqat sotuvchi tanlashi mumkin");
        }
        if (t.getMode() != TradeMode.HUMAN) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu savdo inson admin rejimida emas");
        }
        if (t.getState() != TradeState.WAITING_ADMIN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Admin faqat kutish holatida tanlanadi");
        }
        // No "already assigned" guard on purpose. WAITING_ADMIN means exactly
        // "nobody has taken this job yet", and spec §13.2 is that the seller
        // may work down a list of admins, each getting their own window. An
        // admin who never opens the app declines nothing, so requiring an
        // explicit decline to free the slot would freeze the trade for the
        // full 24h with no seller-side recovery — and the escalation sweeper
        // cannot help, it only ever looks at IN_PROGRESS.
        if (adminId.equals(t.getSellerId()) || adminId.equals(t.getBuyerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Admin o'z savdosining tarafi bo'lolmaydi");
        }
        profileService.requireHireable(adminId, feeUzs);

        t.setAssignedAdminId(adminId);
        t.setAdminFeeUzs(feeUzs);
        // Belt-and-braces for the chat gate (spec §6.1): an invitation must
        // never carry an accepted-at stamp into WAITING_ADMIN, or the newly
        // invited admin would inherit chat access they have not earned.
        t.setAdminAcceptedAt(null);
        t.setStateDeadline(Instant.now().plusSeconds(humanWaitingAdminSeconds));
        trades.save(t);

        events.adminInvited(t);
        changes.publish(t.getChatId());
    }

    @Transactional(readOnly = true)
    public List<Trade> listInvitations(UUID adminId) {
        return trades.findByAssignedAdminIdAndState(adminId, TradeState.WAITING_ADMIN);
    }

    @Transactional(readOnly = true)
    public List<Trade> listMyTrades(UUID adminId) {
        return trades.findByAssignedAdminIdOrderByCreatedAtDesc(adminId);
    }

    /**
     * The trade must exist, be human-mode, be waiting, and be waiting on
     * <em>this</em> admin. 404 rather than 403 for a stranger so the endpoint
     * does not confirm the trade exists.
     */
    private Trade requireInvited(UUID adminId, UUID tradeId) {
        Trade t = trades.findByIdAndViewer(tradeId, adminId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Savdo topilmadi"));
        if (t.getMode() != TradeMode.HUMAN) {
            // Not reachable today — the SMART transition table has no
            // WAITING_ADMIN row — but asserted explicitly so this method's
            // contract doesn't silently depend on that staying true.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Savdo topilmadi");
        }
        if (t.getState() != TradeState.WAITING_ADMIN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu savdo admin javobini kutmayapti");
        }
        if (!adminId.equals(t.getAssignedAdminId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Savdo topilmadi");
        }
        return t;
    }

    private void createChecklist(UUID tradeId) {
        if (!steps.findByTradeId(tradeId).isEmpty()) {
            return;   // idempotent: a reassignment keeps the existing ticks
        }
        for (TradeStep step : TradeStep.values()) {
            steps.save(TradeStepMark.builder()
                    .id(UUID.randomUUID())
                    .tradeId(tradeId)
                    .step(step)
                    .build());
        }
    }
}
