package uz.efbazaar.trade.admin.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.dto.AdminSmartTradeAction;
import uz.efbazaar.trade.admin.dto.AdminSmartTradeDetail;
import uz.efbazaar.trade.admin.dto.AdminSmartTradeRow;
import uz.efbazaar.trade.admin.dto.AdminSmartTradeSide;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.security.AuthSummaryClient;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeSide;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.repository.TradeSideRepository;
import uz.efbazaar.trade.trade.service.TradeAuditService;
import uz.efbazaar.trade.trade.service.TradeChatService;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeSideService;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The admin's hand on a SMART trade the worker could not finish.
 *
 * <p>The worker reads Konami's mail and reports it. When it cannot — the mail
 * arrived in a language its detector does not know, today's case — the trade
 * sits until its deadline expires. This lets an admin read the escrow mailbox
 * and supply the missing step themselves.
 *
 * <p>Every manual step goes through the SAME code path the worker's event
 * does: the code is written with the same repository calls the consumer uses,
 * and the Konami confirmation is the same state-machine transition. Nothing
 * here is a shortcut around the rules — an admin cannot move a trade that the
 * worker could not have moved either.
 */
@Service
@RequiredArgsConstructor
public class AdminSmartTradeService {

    /** The chat status code both parties see when an admin completed a step. */
    public static final String STATUS_ADMIN_ASSISTED = "ADMIN_ASSISTED";

    private final TradeRepository trades;
    private final TradeSideService sides;
    private final TradeSideRepository sideRepo;
    private final MailboxService mailboxes;
    private final TradeService tradeService;
    private final TradeAuditService audit;
    private final TradeChatService chat;
    private final AuthSummaryClient users;

    /**
     * Live SMART trades, the ones waiting for a hand first.
     *
     * <p>Deliberately not {@code @Transactional}: resolving names is an HTTP
     * call to auth-service, and holding a database connection open across it
     * would let a slow auth-service starve trade-service's pool.
     */
    public List<AdminSmartTradeRow> active() {
        List<Trade> live = trades.findByModeAndStateInOrderByUpdatedAtDesc(
                TradeMode.SMART, TradeState.nonTerminal());
        Map<UUID, AuthSummaryClient.UserSummary> names = users.resolveAll(partiesOf(live));
        return live.stream()
                .map(t -> row(t, names))
                // Stable sort: within each group the repository's newest-first
                // order survives.
                .sorted(Comparator.comparing(r -> r.expectedAction() == AdminSmartTradeAction.NONE))
                .toList();
    }

    public AdminSmartTradeDetail detail(UUID tradeId) {
        Trade t = requireSmart(tradeId);
        Map<UUID, AuthSummaryClient.UserSummary> names = users.resolveAll(partiesOf(List.of(t)));
        List<AdminSmartTradeSide> views = new ArrayList<>();
        for (ParticipantRole role : ParticipantRole.values()) {
            views.add(sideView(t, role));
        }
        return new AdminSmartTradeDetail(row(t, names), views);
    }

    /**
     * Records the email-change code an admin read from the escrow mailbox.
     *
     * <p>Writes exactly what {@code KonamiEmailChangeCodeConsumer} writes: the
     * party's own row and the trade-level column. The code does not move the
     * trade — it is shown to the party, who types it into Konami and then
     * reports the change themselves.
     */
    @Transactional
    public void submitEmailChangeCode(UUID adminId, UUID tradeId, ParticipantRole role, String code) {
        Trade t = requireSmart(tradeId);
        requireState(t, TradeState.WAITING_EMAIL_CHANGE);
        requireMailbox(t, role);

        Instant now = Instant.now();
        sideRepo.recordEmailChangeCode(tradeId, role, code, now);
        trades.recordEmailChangeCode(tradeId, code, now);

        audit.record(tradeId, ActorType.ADMIN, adminId, "ADMIN_EMAIL_CHANGE_CODE",
                Map.of("role", role.name(), "code", code));
        // The code itself stays out of the chat note: it belongs in the
        // party's panel, and the other party has no use for it.
        chat.postStatusToBoth(tradeId, STATUS_ADMIN_ASSISTED,
                Map.of("step", "EMAIL_CHANGE_CODE", "side", role.name()));
    }

    /**
     * Confirms Konami's verification mail reached this party's mailbox.
     *
     * <p>The same {@code KONAMI_EMAIL_RECEIVED} transition the worker's event
     * drives, stamped against the party the admin names rather than guessed.
     * On a swap the trade moves only once both parties are confirmed, exactly
     * as it would for the worker.
     */
    @Transactional
    public void confirmKonamiEmail(UUID adminId, UUID tradeId, ParticipantRole role) {
        Trade t = requireSmart(tradeId);
        requireState(t, TradeState.VERIFYING_KONAMI_LINK);
        requireMailbox(t, role);

        tradeService.transition(tradeId, TradeEvent.KONAMI_EMAIL_RECEIVED,
                ActorType.ADMIN, adminId, role);

        audit.record(tradeId, ActorType.ADMIN, adminId, "ADMIN_KONAMI_EMAIL_CONFIRMED",
                Map.of("role", role.name()));
        chat.postStatusToBoth(tradeId, STATUS_ADMIN_ASSISTED,
                Map.of("step", "KONAMI_EMAIL", "side", role.name()));
    }

    // ------------------------------------------------------------------

    private Trade requireSmart(UUID tradeId) {
        return trades.findById(tradeId)
                .filter(t -> t.getMode() == TradeMode.SMART)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
    }

    /**
     * 409 rather than a silent no-op: the admin was looking at a page that no
     * longer matches the trade, and should see that before doing anything else.
     */
    private static void requireState(Trade t, TradeState expected) {
        if (t.getState() != expected) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Savdo boshqa bosqichga o'tgan: " + t.getState());
        }
    }

    private void requireMailbox(Trade t, ParticipantRole role) {
        if (mailboxIdOf(t, role) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bu tomonda pochta qutisi yo'q");
        }
    }

    /**
     * The mailbox this party moves their account into.
     *
     * <p>Not {@code TradeService.mailboxFor}: that one falls back to the trade's
     * own mailbox for any role, so a sale's buyer would appear to have the
     * seller's box and an admin could record a code against the wrong party.
     */
    private UUID mailboxIdOf(Trade t, ParticipantRole role) {
        UUID own = sides.of(t.getId(), role).map(TradeSide::getMailboxId).orElse(null);
        if (own != null) return own;
        return role == ParticipantRole.SELLER ? t.getMailboxId() : null;
    }

    private AdminSmartTradeSide sideView(Trade t, ParticipantRole role) {
        Optional<TradeSide> side = sides.of(t.getId(), role);
        UUID mailboxId = mailboxIdOf(t, role);
        Mailbox box = null;
        if (mailboxId != null) {
            try {
                box = mailboxes.getRaw(mailboxId);
            } catch (EntityNotFoundException ignored) {
                // The row was cleaned up; the side still shows, without a box.
            }
        }
        return new AdminSmartTradeSide(
                role,
                box == null ? null : mailboxId,
                box == null ? null : box.getEmail(),
                box != null && box.getProvisionedAt() != null,
                side.map(TradeSide::getEmailChangeCode).orElse(null),
                side.map(TradeSide::getEmailChangeCodeAt).orElse(null),
                side.map(TradeSide::getEmailChangedAt).orElse(null),
                side.map(TradeSide::getKonamiVerifiedAt).orElse(null));
    }

    private static AdminSmartTradeRow row(Trade t, Map<UUID, AuthSummaryClient.UserSummary> names) {
        return new AdminSmartTradeRow(
                t.getId(), t.getKind(), t.getState(),
                t.getSellerId(), t.getBuyerId(),
                nameOf(names.get(t.getSellerId())), nameOf(names.get(t.getBuyerId())),
                t.getUpdatedAt(), t.getStateDeadline(),
                AdminSmartTradeAction.forState(t.getState()),
                t.getCreatedAt());
    }

    private static String nameOf(AuthSummaryClient.UserSummary u) {
        if (u == null) return null;
        if (u.telegramUsername() != null && !u.telegramUsername().isBlank()) {
            return "@" + u.telegramUsername();
        }
        return u.displayName();
    }

    private static Set<UUID> partiesOf(List<Trade> list) {
        Set<UUID> ids = new HashSet<>();
        for (Trade t : list) {
            ids.add(t.getSellerId());
            ids.add(t.getBuyerId());
        }
        return ids;
    }
}
