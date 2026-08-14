package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeChat;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeMessage;
import uz.efbazaar.trade.trade.domain.TradeMessageType;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.TradePage;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TradeService {

    private final TradeRepository trades;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeStateMachine sm;
    private final TradeStateHandler handler;
    private final TradeAuditService audit;
    private final MailboxService mailboxes;
    private final TradeBroadcaster broadcaster;
    private final TradeEventPublisher events;

    @Value("${trade.human.expires-after-hours:168}")
    private long humanExpiresAfterHours;

    @Transactional
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId) {
        return openTrade(sellerId, buyerId, priceUzs, sellerCardId, buyerCardId,
                listingId, null, TradeMode.SMART, null, null);
    }

    @Transactional
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId,
                                   UUID chatId) {
        return openTrade(sellerId, buyerId, priceUzs, sellerCardId, buyerCardId,
                listingId, chatId, TradeMode.SMART, null, null);
    }

    @Transactional
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId,
                                   UUID chatId, TradeMode mode,
                                   UUID assignedAdminId, Long adminFeeUzs) {
        return openTrade(UUID.randomUUID(), sellerId, buyerId, priceUzs, sellerCardId,
                buyerCardId, listingId, chatId, mode, assignedAdminId, adminFeeUzs);
    }

    /**
     * Opens a trade under an id the caller already knows.
     *
     * <p>Exists because the escrow hold has to happen before the trade row does
     * — a trade must never exist without the money behind it — and the hold is
     * keyed by trade id. The caller generates the id, holds, then opens.
     */
    @Transactional
    public TradeResponse openTrade(UUID tradeId, UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId,
                                   UUID chatId, TradeMode mode,
                                   UUID assignedAdminId, Long adminFeeUzs) {
        if (mode == TradeMode.HUMAN && assignedAdminId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Inson admin savdosi uchun admin tanlanishi kerak");
        }

        // The mailbox row is created up-front with a synthetic email; the worker
        // (Task 14) overwrites the email + password once it "provisions" Mailcow
        // in response to the email-provision-request event.
        UUID mailboxId = allocatePlaceholderMailbox();

        Trade t = Trade.builder()
                .id(tradeId)
                .sellerId(sellerId)
                .buyerId(buyerId)
                .listingId(listingId)
                .chatId(chatId)
                .priceUzs(priceUzs)
                .state(TradeState.INITIATED)
                .mailboxId(mailboxId)
                .sellerCardId(sellerCardId)
                .buyerCardId(buyerCardId)
                .mode(mode)
                .assignedAdminId(assignedAdminId)
                .adminFeeUzs(adminFeeUzs)
                .expiresAt(Instant.now().plus(Duration.ofHours(
                        mode == TradeMode.HUMAN ? humanExpiresAfterHours : 24)))
                .build();

        handler.onEnter(t, TradeState.INITIATED, ActorType.SYSTEM, null, null);
        trades.save(t);

        chats.save(TradeChat.builder()
                .id(UUID.randomUUID())
                .tradeId(t.getId())
                .participant(ParticipantRole.SELLER)
                .build());
        chats.save(TradeChat.builder()
                .id(UUID.randomUUID())
                .tradeId(t.getId())
                .participant(ParticipantRole.BUYER)
                .build());

        audit.record(t.getId(), ActorType.SYSTEM, null, "TRADE_OPENED", Map.of(
                "sellerId", sellerId.toString(),
                "buyerId", buyerId.toString(),
                "priceUzs", String.valueOf(priceUzs),
                "mode", mode.name()
        ));
        broadcaster.publishStateChange(t.getId(), toResponse(t, null));
        // Hold the marketplace chat open for as long as the trade lives.
        if (chatId != null) {
            events.tradeOpened(t);
        }
        return toResponse(t, null);
    }

    /**
     * Look up a trade AND assert the caller is a participant. Called from
     * every trade endpoint; throwing here short-circuits any per-endpoint
     * ownership check.
     */
    @Transactional(readOnly = true)
    public Trade get(UUID tradeId, UUID viewerUserId) {
        return trades.findByIdAndParticipant(tradeId, viewerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
    }

    /**
     * Look up a trade for anyone entitled to see it — either party or the
     * assigned human admin. Prefer {@link #get} where the caller must be a
     * party (e.g. confirming the close).
     */
    @Transactional(readOnly = true)
    public Trade getForViewer(UUID tradeId, UUID viewerUserId) {
        return trades.findByIdAndViewer(tradeId, viewerUserId)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
    }

    /** Canonical mutation. Every action goes through here. */
    @Transactional
    public Trade transition(UUID tradeId, TradeEvent event, ActorType actor, UUID actorId) {
        Trade t = trades.findById(tradeId)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
        TradeState from = t.getState();
        // MAILBOX_PROVISIONED must only be driven by the worker's
        // email-provisioned response — otherwise any caller could advance
        // INITIATED -> WAITING_PAYMENT with a placeholder mailbox that has
        // no real address/password yet (zero-byte escrow mailbox).
        if (event == TradeEvent.MAILBOX_PROVISIONED && actor != ActorType.WORKER) {
            throw new InvalidTradeTransitionException(from, event);
        }
        TradeState to = sm.transition(t.getMode(), from, event);
        t.setState(to);
        handler.onEnter(t, to, actor, actorId, event);
        trades.save(t);
        audit.record(t.getId(), actor, actorId, "STATE_TRANSITION",
                Map.of("from", from.name(), "to", to.name(), "event", event.name()));
        broadcaster.publishStateChange(t.getId(), toResponse(t, null));
        return t;
    }

    public TradeResponse toResponse(Trade t, ParticipantRole role) {
        String mailboxEmail = resolveMailboxEmail(t);
        UUID passwordMessageId = resolvePasswordMessageId(t);
        return new TradeResponse(t.getId(), t.getState(),
                t.getSellerId(), t.getBuyerId(), t.getPriceUzs(),
                t.getMailboxId(), mailboxEmail, t.getChatId(), t.getCreatedAt(), t.getExpiresAt(),
                t.getStateDeadline(), role, passwordMessageId,
                t.getEmailChangeVerificationCode());
    }

    /**
     * Escrow-mailbox address is exposed on the trade so the seller sees which
     * address to enter on Konami — the mailbox row itself is not owned by the
     * seller yet (MailboxService.getOwned would reject them).
     */
    private String resolveMailboxEmail(Trade t) {
        if (t.getMailboxId() == null) return null;
        try {
            Mailbox mb = mailboxes.getRaw(t.getMailboxId());
            String email = mb.getEmail();
            // Suppress the "pending-…@efbazaar.uz" placeholder — the frontend
            // renders a spinner while INITIATED so no address should leak.
            return email != null && email.startsWith("pending-") ? null : email;
        } catch (RuntimeException e) {
            log.warn("Could not resolve mailbox email for trade {}: {}", t.getId(), e.getMessage());
            return null;
        }
    }

    /**
     * Once WAITING_BUYER_VERIFY is reached the buyer needs the id of the
     * PASSWORD_ONETIME message in their chat so the reveal endpoint can
     * decrypt it. There is at most one such message per trade (spec §6).
     */
    private UUID resolvePasswordMessageId(Trade t) {
        TradeState s = t.getState();
        if (s != TradeState.WAITING_BUYER_VERIFY && s != TradeState.SUCCESS) return null;
        return chats.findByTradeIdAndParticipant(t.getId(), ParticipantRole.BUYER)
                .flatMap(c -> messages.findByTradeChatIdOrderByCreatedAtAsc(c.getId()).stream()
                        .filter(m -> m.getMessageType() == TradeMessageType.PASSWORD_ONETIME)
                        .map(TradeMessage::getId)
                        .findFirst())
                .orElse(null);
    }

    /**
     * Trades in the given marketplace chat where {@code viewerUserId} is a
     * participant. Newest first — the chat panel typically shows only the
     * most recent trade for the chat.
     */
    @Transactional(readOnly = true)
    public java.util.List<TradeResponse> listByChat(UUID chatId, UUID viewerUserId) {
        return trades.findByChatIdAndParticipantOrderByCreatedAtDesc(chatId, viewerUserId).stream()
                .map(t -> toResponse(t, t.roleFor(viewerUserId)))
                .toList();
    }

    /**
     * Every trade the caller is a party to, newest first, paged. Each entry
     * carries the caller's own {@link ParticipantRole} — the same trade is a
     * sale for one side and a purchase for the other.
     */
    @Transactional(readOnly = true)
    public TradePage listMine(UUID viewerUserId, int limit, int offset) {
        Pageable pageable = PageRequest.of(offset / limit, limit);
        Page<Trade> page = trades.findByParticipant(viewerUserId, pageable);
        return new TradePage(
                page.getContent().stream()
                        .map(t -> toResponse(t, t.roleFor(viewerUserId)))
                        .toList(),
                page.getTotalElements(),
                limit,
                offset);
    }

    private UUID allocatePlaceholderMailbox() {
        // Insert a mailbox row up-front with a synthetic email; the worker
        // (Task 14) overwrites it on email-provisioned response.
        return mailboxes.createPlaceholder("pending-" + UUID.randomUUID() + "@efbazaar.uz");
    }
}
