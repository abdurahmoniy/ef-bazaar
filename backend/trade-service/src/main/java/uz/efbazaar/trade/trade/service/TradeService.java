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
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeChat;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.domain.TradeMessage;
import uz.efbazaar.trade.trade.domain.TradeMessageType;
import uz.efbazaar.trade.trade.domain.TradeKind;
import uz.efbazaar.trade.trade.domain.AdminFeePayer;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeSide;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.dto.TradePage;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.dto.TradeSideResponse;
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
    private final TradeSideService sideService;
    private final TradeAuditService audit;
    private final MailboxService mailboxes;
    private final uz.efbazaar.trade.partner.PartnerAttributionClient partners;
    private final TradeBroadcaster broadcaster;
    private final TradeEventPublisher events;
    private final uz.efbazaar.trade.plan.service.MailboxSlotService slots;

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
        return openTrade(tradeId, sellerId, buyerId, priceUzs, sellerCardId, buyerCardId,
                listingId, chatId, mode, assignedAdminId, adminFeeUzs,
                TradeKind.SALE, priceUzs);
    }

    /** As above, for a caller that knows the deal's shape and its fee base. */
    @Transactional
    public TradeResponse openTrade(UUID tradeId, UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId,
                                   UUID chatId, TradeMode mode,
                                   UUID assignedAdminId, Long adminFeeUzs,
                                   TradeKind kind, long feeBaseUzs) {
        return openTrade(tradeId, sellerId, buyerId, priceUzs, sellerCardId, buyerCardId, listingId,
                chatId, mode, assignedAdminId, adminFeeUzs, kind, feeBaseUzs, AdminFeePayer.SELLER);
    }

    @Transactional
    public TradeResponse openTrade(UUID tradeId, UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId,
                                   UUID chatId, TradeMode mode, UUID assignedAdminId, Long adminFeeUzs,
                                   TradeKind kind, long feeBaseUzs, AdminFeePayer adminFeePayer) {
        if (mode == TradeMode.HUMAN && assignedAdminId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Inson admin savdosi uchun admin tanlanishi kerak");
        }

        // Checked before anything is created, and per party: a swap makes a
        // mailbox for each of them, and charging both to whoever opened the
        // trade would let one user spend the other's allowance. Refusing here
        // rather than later also means a trade that cannot have its mailboxes
        // is never written at all.
        slots.assertCanAllocate(sellerId);
        if (kind.isSwap()) {
            slots.assertCanAllocate(buyerId);
        }

        // The mailbox row is created up-front with a synthetic email; the worker
        // (Task 14) overwrites the email + password once it "provisions" Mailcow
        // in response to the email-provision-request event.
        UUID mailboxId = allocatePlaceholderMailbox();
        // A swap needs a second box: both parties move an account out, and at
        // the end the two are handed over crossed. A sale allocates one, since
        // the buyer transfers nothing.
        UUID buyerMailboxId = kind.isSwap() ? allocatePlaceholderMailbox() : null;

        // Hamkor va stavka SHU YERDA muhrlanadi. Keyingi bosishlar
        // marketplace tarafdagi biriktirishni o'zgartirishi mumkin, bu
        // savdoga esa ta'sir qilmaydi — kelishuv ochilgan paytda
        // qotadi.
        var attribution = partners.lookup(listingId, buyerId);

        Trade t = Trade.builder()
                .id(tradeId)
                .sellerId(sellerId)
                .buyerId(buyerId)
                .partnerUserId(attribution.map(a -> a.partnerUserId()).orElse(null))
                .partnerPercentBp(attribution.map(a -> a.percentBp()).orElse(null))
                .listingId(listingId)
                .chatId(chatId)
                .priceUzs(priceUzs)
                .state(TradeState.INITIATED)
                .mailboxId(mailboxId)
                .sellerCardId(sellerCardId)
                .buyerCardId(buyerCardId)
                .mode(mode)
                .kind(kind)
                .feeBaseUzs(feeBaseUzs)
                .adminFeePayer(adminFeePayer == null ? AdminFeePayer.SELLER : adminFeePayer)
                .assignedAdminId(assignedAdminId)
                .adminFeeUzs(adminFeeUzs)
                .expiresAt(Instant.now().plus(Duration.ofHours(
                        mode == TradeMode.HUMAN ? humanExpiresAfterHours : 24)))
                .build();

        // Saved and flushed before the sides: trade_sides carries a foreign key
        // to this row, and onEnter below reads the sides to decide how many
        // mailboxes to have provisioned.
        trades.saveAndFlush(t);
        sideService.open(tradeId, mailboxId, buyerMailboxId);

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
        broadcaster.publishStateChange(t.getId(),
                toResponse(t, ParticipantRole.SELLER), toResponse(t, ParticipantRole.BUYER));
        // Hold the marketplace chat open for as long as the trade lives.
        if (chatId != null) {
            events.tradeOpened(t);
        }
        return toResponse(t, null);
    }

    /**
     * Shu chatda tugallanmagan savdo bormi — marketplace so'raydi.
     *
     * <p>Chat tarixini tozalash savdoni buzmaydi (panel baribir shu
     * yerdan keladi), lekin savdo davom etayotganda kelishuv yozishmasi
     * yo'qolishi nizoni hal qilib bo'lmas holga keltiradi.
     */
    @Transactional(readOnly = true)
    public boolean hasLiveTradeInChat(UUID chatId) {
        return chatId != null && trades.existsLiveInChat(chatId, TradeState.nonTerminal());
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

    /** The trade as one participant sees it — their own mailbox, their own role. */
    @Transactional(readOnly = true)
    public TradeResponse toResponseFor(UUID tradeId, UUID viewerUserId) {
        Trade t = get(tradeId, viewerUserId);
        return toResponse(t, t.roleFor(viewerUserId));
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
        return transition(tradeId, event, actor, actorId, null);
    }

    /**
     * As above, for a caller that knows which side acted when the actor id does
     * not say — a worker reporting on one of a swap's two mailboxes.
     */
    @Transactional
    public Trade transition(UUID tradeId, TradeEvent event, ActorType actor, UUID actorId,
                            ParticipantRole actingSide) {
        // Locked, not merely read. This method loads the trade, computes the
        // next state and saves the whole row, so two transitions running at
        // once each compute from their own snapshot and the slower one commits
        // a state the faster one has already moved past. A swap makes that
        // routine: the worker reports one provisioned mailbox per side and the
        // second report enables a PAYMENT_CONFIRMED that races the first — a
        // paid-for trade dropped back to waiting for payment, and the parties'
        // next click came back as an illegal event. The lock makes the loser
        // re-read, so it either moves the trade forward or is refused.
        Trade t = trades.findByIdForUpdate(tradeId)
                .orElseThrow(() -> new EntityNotFoundException("Trade " + tradeId));
        TradeState from = t.getState();
        Map<ParticipantRole, String> previousTurns = turnSnapshot(t);
        // MAILBOX_PROVISIONED must only be driven by the worker's
        // email-provisioned response — otherwise any caller could advance
        // INITIATED -> WAITING_PAYMENT with a placeholder mailbox that has
        // no real address/password yet (zero-byte escrow mailbox).
        if (event == TradeEvent.MAILBOX_PROVISIONED && actor != ActorType.WORKER) {
            throw new InvalidTradeTransitionException(from, event);
        }
        // Record this party's own progress before deciding whether the trade
        // may move. On a swap both parties do every step, so one party's
        // "done" is not the trade's.
        ParticipantRole side = actingSide != null ? actingSide
                : (actorId != null && t.isParticipant(actorId) ? t.roleFor(actorId) : null);
        if (side != null) {
            sideService.stamp(tradeId, side, event);
        } else if (actor == ActorType.WORKER) {
            // The worker reports per mailbox but names only the trade, so the
            // report is stamped against whichever side is still outstanding.
            sideService.stampNextPending(tradeId, event);
        }
        if (!sideService.bothSidesCleared(t, event)) {
            // Validate the event anyway: an out-of-order one must still be
            // refused rather than quietly stored against the side.
            sm.transition(t.getMode(), from, event);
            audit.record(t.getId(), actor, actorId, "SIDE_PROGRESS",
                    Map.of("event", event.name(), "side", String.valueOf(side)));
            // The panel re-reads side progress from this, which is how each
            // party sees the other one move.
            broadcaster.publishStateChange(t.getId(),
                toResponse(t, ParticipantRole.SELLER), toResponse(t, ParticipantRole.BUYER));
            notifyNewTurns(t, previousTurns);
            return t;
        }

        // A swap waits for both decisions, and either rejection vetoes success.
        // The final event alone cannot decide it: reject then confirm must not
        // transfer accounts that the first participant refused to exchange.
        TradeEvent finalEvent = event;
        if (t.getKind().isSwap()
                && (event == TradeEvent.BUYER_CONFIRM || event == TradeEvent.BUYER_REJECT)) {
            finalEvent = sideService.bothConfirmed(tradeId)
                    ? TradeEvent.BUYER_CONFIRM : TradeEvent.BUYER_REJECT;
        }
        TradeState to = sm.transition(t.getMode(), from, finalEvent);
        t.setState(to);
        handler.onEnter(t, to, actor, actorId, finalEvent);
        trades.save(t);
        audit.record(t.getId(), actor, actorId, "STATE_TRANSITION",
                Map.of("from", from.name(), "to", to.name(), "event", event.name()));
        broadcaster.publishStateChange(t.getId(),
                toResponse(t, ParticipantRole.SELLER), toResponse(t, ParticipantRole.BUYER));
        notifyNewTurns(t, previousTurns);
        return t;
    }

    private Map<ParticipantRole, String> turnSnapshot(Trade trade) {
        return trade.getChatId() == null ? Map.of() : TradeTurns.snapshot(trade, sideService.of(trade.getId()));
    }

    private void notifyNewTurns(Trade trade, Map<ParticipantRole, String> previous) {
        turnSnapshot(trade).forEach((role, key) -> {
            if (!key.equals(previous.get(role))) {
                UUID recipient = role == ParticipantRole.SELLER ? trade.getSellerId() : trade.getBuyerId();
                events.tradeAction(trade.getId(), trade.getChatId(), recipient,
                        TradeEvents.TradeActionType.YOUR_TURN, trade.getPriceUzs(), trade.getState().name(), trade.getKind());
            }
        });
    }

    public TradeResponse toResponse(Trade t, ParticipantRole role) {
        UUID ownMailbox = mailboxFor(t, role);
        String mailboxEmail = resolveMailboxEmail(t, ownMailbox);
        String counterpartMailboxEmail = resolveMailboxEmail(t,
                mailboxFor(t, role == null ? null : other(role)));
        UUID passwordMessageId = resolvePasswordMessageId(t, role);
        return new TradeResponse(t.getId(), t.getState(),
                t.getSellerId(), t.getBuyerId(), t.getPriceUzs(),
                ownMailbox, mailboxEmail, t.getChatId(), t.getCreatedAt(), t.getExpiresAt(),
                t.getStateDeadline(), role, passwordMessageId,
                emailChangeCodeFor(t, role),
                t.getKind(),
                sideService.of(t.getId()).stream().map(TradeSideResponse::of).toList(),
                counterpartMailboxEmail,
                loginCodeFor(t, role),
                null, t.getUpdatedAt(), t.getAdminFeePayer());
    }

    /** Kirish kodi faqat o'z tarafiniki: boshqasining kodi bu akkountga yaramaydi. */
    private String loginCodeFor(Trade t, ParticipantRole role) {
        if (role == null) return null;
        return sideService.of(t.getId(), role).map(TradeSide::getLoginCode).orElse(null);
    }

    /** Re-observe the code for the caller's own email-transfer mailbox. */
    public void requestEmailChangeCode(Trade t, ParticipantRole role) {
        if (t.getMode() != TradeMode.SMART || t.getState() != TradeState.WAITING_EMAIL_CHANGE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Kod faqat emailni o‘zgartirish bosqichida so‘raladi");
        }
        String email = resolveMailboxEmail(t, mailboxFor(t, role));
        if (email == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Pochta hali tayyor emas — birozdan keyin urinib ko‘ring");
        }
        events.imapPollRequest(t.getId(), email, TradeEvents.ImapPurpose.WAIT_EMAIL_CHANGE_CODE);
    }

    /**
     * Kirish kodi kuzatuvini qayta ishga tushiradi.
     *
     * <p>Kuzatiladigan quti — shu taraf QABUL QILAYOTGAN akkountniki, ya'ni
     * qarshi tarafniki. O'z qutisini kuzatish hech narsa bermasdi: kod
     * boshqa akkountga kirishda keladi.
     */
    public void requestLoginCode(Trade t, ParticipantRole role) {
        if (t.getMode() != TradeMode.SMART || t.getState() != TradeState.WAITING_BUYER_VERIFY) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Kirish kodi faqat akkountni tekshirish bosqichida so'raladi");
        }
        UUID box = mailboxFor(t, role == null ? null : other(role));
        String email = resolveMailboxEmail(t, box);
        if (email == null || email.startsWith("pending-")) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Pochta hali tayyor emas — birozdan keyin urinib ko'ring");
        }
        events.imapPollRequest(t.getId(), email, TradeEvents.ImapPurpose.WAIT_2FA_CODE);
        log.info("Login code polling re-requested: trade={} role={}", t.getId(), role);
    }

    /**
     * The verification code this party should type into Konami.
     *
     * <p>On a swap, strictly their own — null until it arrives. Falling back to
     * the trade-level column would hand them the other party's code, which
     * Konami issued for a different account and which simply will not work.
     * A sale has one code and keeps reading it from the trade.
     */
    private String emailChangeCodeFor(Trade t, ParticipantRole role) {
        if (role != null && t.getKind() != null && t.getKind().isSwap()) {
            return sideService.of(t.getId(), role)
                    .map(TradeSide::getEmailChangeCode)
                    .orElse(null);
        }
        return t.getEmailChangeVerificationCode();
    }

    private static ParticipantRole other(ParticipantRole role) {
        return role == ParticipantRole.SELLER ? ParticipantRole.BUYER : ParticipantRole.SELLER;
    }

    /**
     * The escrow mailbox this party moves their own account through.
     *
     * <p>On a swap the two parties have different boxes, and showing one of
     * them to both is how a swap sent both accounts to the same address. On a
     * sale the buyer has no box of their own, so they fall back to the trade's
     * — which is the one they are receiving, and what their panel has always
     * shown.
     *
     * <p>Public because a caller acting for one party must not reach for
     * {@code trade.mailboxId}: on a swap that is the seller's box, and pointing
     * the other party's worker request at it watches the wrong inbox.
     */
    public UUID mailboxFor(Trade t, ParticipantRole role) {
        if (role != null) {
            UUID own = sideService.of(t.getId(), role)
                    .map(TradeSide::getMailboxId)
                    .orElse(null);
            if (own != null) return own;
        }
        return t.getMailboxId();
    }

    private String resolveMailboxEmail(Trade t, UUID mailboxId) {
        if (mailboxId == null) return null;

        try {
            Mailbox mb = mailboxes.getRaw(mailboxId);
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
    /**
     * The password message this viewer may open — the one addressed to them.
     *
     * <p>A password lands in the recipient's chat, and the reveal authorises by
     * finding it there. Resolving it from the buyer's chat whoever asked handed
     * the seller of a swap an id from a chat they are not in, so their reveal
     * could only be refused. On a sale the seller is sent nothing and gets
     * null, which is what their panel already assumes.
     */
    private UUID resolvePasswordMessageId(Trade t, ParticipantRole role) {
        TradeState s = t.getState();
        if (s != TradeState.WAITING_BUYER_VERIFY && s != TradeState.SUCCESS) return null;
        if (role == null) return null;
        return chats.findByTradeIdAndParticipant(t.getId(), role)
                .flatMap(c -> messages.findByTradeChatIdOrderByCreatedAtAsc(c.getId()).stream()
                        .filter(m -> m.getMessageType() == TradeMessageType.PASSWORD_ONETIME)
                        .map(TradeMessage::getId)
                        // The newest. A password can only be sent again by
                        // putting the trade back to WAITING_PASSWORD by hand,
                        // and that is done precisely because the older one is
                        // beyond recovery — offering it again would repeat the
                        // failure the recovery was for.
                        .reduce((older, newer) -> newer))
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
