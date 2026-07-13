package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeChat;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;

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
    private final TradeStateMachine sm;
    private final TradeStateHandler handler;
    private final TradeAuditService audit;
    private final MailboxService mailboxes;

    @Transactional
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId) {
        // The mailbox row is created up-front with a synthetic email; the worker
        // (Task 14) overwrites the email + password once it "provisions" Mailcow
        // in response to the email-provision-request event.
        UUID mailboxId = allocatePlaceholderMailbox();

        Trade t = Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(sellerId)
                .buyerId(buyerId)
                .listingId(listingId)
                .priceUzs(priceUzs)
                .state(TradeState.INITIATED)
                .mailboxId(mailboxId)
                .sellerCardId(sellerCardId)
                .buyerCardId(buyerCardId)
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build();

        handler.onEnter(t, TradeState.INITIATED, ActorType.SYSTEM, null);
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
                "priceUzs", String.valueOf(priceUzs)
        ));
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

    /** Canonical mutation. Every action goes through here. */
    @Transactional
    public Trade transition(UUID tradeId, TradeEvent event, ActorType actor, UUID actorId) {
        Trade t = trades.findById(tradeId)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
        TradeState from = t.getState();
        TradeState to = sm.transition(from, event);
        t.setState(to);
        handler.onEnter(t, to, actor, actorId);
        trades.save(t);
        audit.record(t.getId(), actor, actorId, "STATE_TRANSITION",
                Map.of("from", from.name(), "to", to.name(), "event", event.name()));
        return t;
    }

    public TradeResponse toResponse(Trade t, ParticipantRole role) {
        return new TradeResponse(t.getId(), t.getState(),
                t.getSellerId(), t.getBuyerId(), t.getPriceUzs(),
                t.getMailboxId(), t.getCreatedAt(), t.getExpiresAt(),
                t.getStateDeadline(), role);
    }

    private UUID allocatePlaceholderMailbox() {
        // Insert a mailbox row up-front with a synthetic email; the worker
        // (Task 14) overwrites it on email-provisioned response.
        return mailboxes.createPlaceholder("pending-" + UUID.randomUUID() + "@efbazaar.uz");
    }
}
