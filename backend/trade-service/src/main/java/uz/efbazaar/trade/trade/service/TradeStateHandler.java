package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.admin.service.TradeAdminStats;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.payment.EscrowClient;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeSide;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * On-enter side effects for each state. Kept separate from TradeService so
 * the state machine mechanics (transition validation + save) and the
 * business side effects (kafka, deadlines, mailbox handoff) stay small
 * and testable.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeStateHandler {

    private final TradeEventPublisher events;
    private final MailboxService mailboxes;
    private final TradeSideService sides;
    private final TradeAuditService audit;
    private final TradeAdminStats adminStats;
    private final EscrowClient escrow;

    @Value("${trade.timeouts.waiting-payment-seconds}")        private long twpS;
    @Value("${trade.timeouts.waiting-email-change-seconds}")   private long twecS;
    @Value("${trade.timeouts.verifying-konami-link-seconds}")  private long tvklS;
    @Value("${trade.timeouts.waiting-password-seconds}")       private long twpwS;
    @Value("${trade.timeouts.waiting-buyer-verify-seconds}")   private long twbvS;

    @Value("${trade.timeouts.human-waiting-admin-seconds}")     private long thwaS;
    @Value("${trade.timeouts.human-close-confirm-seconds}")     private long thccS;
    @Value("${trade.timeouts.human-admin-idle-seconds}")        private long thaiS;

    /**
     * Called AFTER the trade's state field is set to {@code newState} and
     * BEFORE the trade is saved. Mutates the trade's {@code stateDeadline}
     * and {@code terminalReason}, publishes Kafka events, and touches
     * ancillary services.
     *
     * @param event the event that triggered this transition, or {@code null}
     *              for the system-initiated entry into {@code INITIATED} from
     *              {@link TradeService#openTrade}. Used to distinguish a fresh
     *              entry into {@code VERIFYING_KONAMI_LINK} from the
     *              {@code RECHECK} self-loop (spec §3.3): recheck re-polls
     *              IMAP explicitly via {@code events.imapPollRequest(...)} in
     *              the controller and must not re-trigger a Konami
     *              forgot-password rotation.
     */
    /**
     * Every escrow mailbox this trade is moving an account through.
     *
     * <p>One on a sale, two on a swap. Falls back to the trade's own column for
     * rows written before sides existed, so an in-flight trade mid-upgrade
     * still finds its mailbox.
     */
    private List<UUID> mailboxesOf(Trade trade) {
        List<UUID> boxes = sides.of(trade.getId()).stream()
                .map(TradeSide::getMailboxId)
                .filter(java.util.Objects::nonNull)
                .toList();
        return boxes.isEmpty() ? List.of(trade.getMailboxId()) : boxes;
    }

    /**
     * Gives each escrow mailbox to whoever should end up with it.
     *
     * <p>{@code crossed} is the whole point of a swap: on success each party
     * receives the account the OTHER one put in. Every other ending — a
     * rejection, a silent party, a deadline — hands each account back to the
     * person who put it up, which is also what a failed sale does.
     */
    /**
     * Pochta qutisi ochilmadi — savdo hech qanday iz qoldirmay yopiladi.
     *
     * <p>{@code handOver} QILINMAYDI. U qutini egasiga berib parolini
     * almashtiradi; bu yerda esa quti pochta serverida umuman
     * ochilmagan va almashtiradigan parol yo'q. Ustiga egasi bo'lgan
     * quti keyinchalik o'chirilmaydi ham va odamning slot kvotasini
     * bekorga band qilib turardi.
     */
    private void onProvisionFailed(Trade trade, ActorType actor, UUID actorId) {
        // Pul darhol qaytadi: savdo boshlanmagan ham.
        releaseEscrow(trade);
        trade.setTerminalReason("PROVISION_FAILED");
        discardPlaceholders(trade);
        audit.record(trade.getId(), actor, actorId, "TRADE_PROVISION_FAILED",
                Map.of("actor", actor.name(), "mailboxesDiscarded", "true"));
        if (trade.getChatId() != null) {
            events.tradeClosed(trade);
        }
        events.tradeAction(trade.getId(), trade.getChatId(), trade.getSellerId(),
                TradeEvents.TradeActionType.TRADE_ORPHANED, trade.getPriceUzs(), null, trade.getKind());
        events.tradeAction(trade.getId(), trade.getChatId(), trade.getBuyerId(),
                TradeEvents.TradeActionType.TRADE_ORPHANED, trade.getPriceUzs(), null, trade.getKind());
    }

    /**
     * Ochilmagan pochta qutilarini yo'q qiladi.
     *
     * <p>Savdo "hech qanday iz qoldirmasdan" yopilishi kerak: bu
     * qatorlar pochta serverida hech narsaga mos kelmaydi, lekin
     * qolsa foydalanuvchining slot kvotasini band qilib turardi va
     * u yangi savdo ocha olmasdi — aynan bugungi tuzoqning o'zi.
     *
     * <p>Bittasi haqiqatda ochilib ulgurgan bo'lsa (ikki qutili
     * savdoda biri o'tib, ikkinchisi yiqilgan) unga TEGILMAYDI:
     * pochta serverida real quti bor va uni jimgina yo'qotish
     * ma'lumot yo'qotish bo'lardi.
     */
    private void discardPlaceholders(Trade trade) {
        for (UUID box : mailboxesOf(trade)) {
            var mb = mailboxes.getRaw(box);
            if (mb == null || mb.getProvisionedAt() != null) continue;
            mailboxes.deleteUnheld(box);
        }
    }

    private void handOver(Trade trade, boolean crossed) {
        List<TradeSide> both = sides.of(trade.getId());
        if (both.isEmpty()) {
            // Pre-sides trade: the old single-mailbox rule.
            UUID receives = crossed ? trade.getBuyerId() : trade.getSellerId();
            events.mailboxRotateRequest(trade.getMailboxId(),
                    mailboxes.getRaw(trade.getMailboxId()).getEmail());
            mailboxes.assignOwner(trade.getMailboxId(), receives, trade.getCreatedAt());
            tell(trade, trade.getMailboxId(), receives, crossed);
            return;
        }
        for (TradeSide side : both) {
            if (side.getMailboxId() == null) continue;   // the buyer's, on a sale
            UUID putItUp = side.role() == ParticipantRole.SELLER
                    ? trade.getSellerId() : trade.getBuyerId();
            UUID theOther = side.role() == ParticipantRole.SELLER
                    ? trade.getBuyerId() : trade.getSellerId();
            UUID receives = crossed ? theOther : putItUp;
            events.mailboxRotateRequest(side.getMailboxId(),
                    mailboxes.getRaw(side.getMailboxId()).getEmail());
            mailboxes.assignOwner(side.getMailboxId(), receives, trade.getCreatedAt());
            tell(trade, side.getMailboxId(), receives, crossed);
        }
    }

    /**
     * Tells the party the inbox is theirs now.
     *
     * <p>Worth saying on every ending, for opposite reasons. On a completed
     * trade it is the account they were given, and they may want to move it on
     * to an address of their own — for which Konami's codes arrive here. On any
     * other ending it is the box they were told to move their own account
     * through: if they already did, that account is behind an address they
     * have no reason to think still belongs to them, and silence is how people
     * lose accounts.
     *
     * <p>Best-effort. A trade must not fail to close because a notification
     * could not be sent.
     */
    private void tell(Trade trade, UUID mailboxId, UUID recipient, boolean crossed) {
        if (recipient == null) return;
        try {
            String address = mailboxes.getRaw(mailboxId).getEmail();
            if (address == null || address.startsWith("pending-")) return;
            events.mailboxHandedOver(trade.getId(), recipient, address,
                    crossed ? TradeEvents.HandoverOutcome.RECEIVED
                            : TradeEvents.HandoverOutcome.RETURNED);
        } catch (RuntimeException e) {
            log.warn("Could not announce mailbox {} handover on trade {}: {}",
                    mailboxId, trade.getId(), e.getMessage());
        }
    }

    /**
     * Whether this address is something the worker can actually log into.
     *
     * <p>Until provisioning reports back, a mailbox row carries a
     * "pending-…@efbazaar.uz" placeholder that exists in no mail server. Sending
     * the worker at it produces a login failure and nothing else — the party
     * waits on a Konami code that can never arrive, with no trace of why. We
     * should be past provisioning by these states, so reaching here is a fault
     * worth a loud line rather than a silent chase.
     */
    private boolean askWorkerFor(Trade trade, String email, String what) {
        if (email != null && !email.startsWith("pending-")) return true;
        log.error("{} skipped for trade {}: mailbox is still the placeholder {} — "
                + "provisioning never reported this box back",
                what, trade.getId(), email);
        return false;
    }

    public void onEnter(Trade trade, TradeState newState, ActorType actor, UUID actorId, TradeEvent event) {
        switch (newState) {
            case INITIATED -> {
                trade.setStateDeadline(null);
                // Both modes need an escrow mailbox — only the Konami/IMAP
                // automation is smart-only. Spec §3.2.
                for (UUID box : mailboxesOf(trade)) {
                    events.emailProvisionRequest(trade.getId(), box);
                }
            }
            case WAITING_PAYMENT -> trade.setStateDeadline(now(twpS));
            case WAITING_EMAIL_CHANGE -> {
                trade.setStateDeadline(now(twecS));
                if (trade.getMode() == TradeMode.SMART) {
                    // Konami will send a 6-digit verification code to the escrow
                    // mailbox when the seller starts the "Update Email Address"
                    // flow. Start polling now so the code lands in the trade panel
                    // as soon as it arrives — seller can't read the escrow inbox
                    // themselves during WAITING_EMAIL_CHANGE.
                    for (UUID box : mailboxesOf(trade)) {
                        var mb = mailboxes.getRaw(box);
                        if (!askWorkerFor(trade, mb.getEmail(), "imap-poll")) continue;
                        events.imapPollRequest(trade.getId(), mb.getEmail(),
                                TradeEvents.ImapPurpose.WAIT_EMAIL_CHANGE_CODE);
                    }
                }
            }
            case VERIFYING_KONAMI_LINK -> {
                trade.setStateDeadline(now(tvklS));
                if (trade.getMode() == TradeMode.SMART && event != TradeEvent.RECHECK) {
                    // fire-and-forget forgot-password. The mailbox email is stored on the mailbox row.
                    for (UUID box : mailboxesOf(trade)) {
                        var mb = mailboxes.getRaw(box);
                        if (!askWorkerFor(trade, mb.getEmail(), "forgot-password")) continue;
                        events.forgotPasswordRequest(trade.getId(), mb.getEmail(), null);
                        // HAR QUTI uchun o'z kuzatuvi. Busiz tiklash xatini
                        // hech kim o'qimasdi: yagona yo'l "Tekshirish"
                        // tugmasi edi va u 5 daqiqada bir marta ochiladi —
                        // ya'ni savdo odam tugmani bosmaguncha turardi.
                        events.imapPollRequest(trade.getId(), mb.getEmail(),
                                TradeEvents.ImapPurpose.VERIFY_LINK);
                    }
                }
            }
            case WAITING_PASSWORD     -> trade.setStateDeadline(now(twpwS));
            case WAITING_BUYER_VERIFY -> {
                trade.setStateDeadline(now(twbvS));
                if (trade.getMode() == TradeMode.SMART) {
                    // Oluvchi akkountga kirmoqchi bo'lganda Konami tasdiqlash
                    // kodini pochtaga yuboradi. Pochta hali platformada —
                    // u o'qiy olmaydi, shuning uchun kuzatuvni shu yerda
                    // boshlaymiz va kod kelishi bilan paneliga tushadi.
                    for (UUID box : mailboxesOf(trade)) {
                        var mb = mailboxes.getRaw(box);
                        if (!askWorkerFor(trade, mb.getEmail(), "imap-poll")) continue;
                        events.imapPollRequest(trade.getId(), mb.getEmail(),
                                TradeEvents.ImapPurpose.WAIT_2FA_CODE);
                    }
                }
            }

            // ----- human path -----

            case WAITING_ADMIN -> {
                trade.setStateDeadline(now(thwaS));
                trade.setEscalationDeadlineAt(null);
                if (event == TradeEvent.ADMIN_DECLINED) {
                    // Clear the assignment so the seller can invite somebody
                    // else. No invitation event — there is nobody to invite yet.
                    trade.setAssignedAdminId(null);
                    trade.setAdminFeeUzs(null);
                } else if (trade.getAssignedAdminId() != null) {
                    events.adminInvited(trade);
                }
            }
            case IN_PROGRESS -> {
                // MUST be null: TradeTimeoutScheduler fires TIMEOUT for every
                // non-terminal state with a due state_deadline, and IN_PROGRESS
                // has no TIMEOUT transition — it would throw every 10 seconds
                // forever. The idle watchdog lives in escalationDeadlineAt.
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(now(thaiS));
                if (trade.getAdminAcceptedAt() == null) {
                    trade.setAdminAcceptedAt(Instant.now());
                }
                // The admin needs to read the escrow inbox from mail.efbazaar.uz.
                // MailService authorises purely on ownership, so this is the
                // whole grant. Revoked by the rotate on any terminal state.
                mailboxes.assignOwner(trade.getMailboxId(), trade.getAssignedAdminId(), trade.getCreatedAt());
            }
            case WAITING_CLOSE_CONFIRM -> {
                trade.setStateDeadline(now(thccS));
                trade.setEscalationDeadlineAt(null);
                trade.setAdminClosedAt(Instant.now());
                // The admin finished the job — even if they were escalated
                // for being idle first. Without this the platform queue
                // (TradeEscalationService.listEscalated, Task 15) would keep
                // showing a trade that is already on its way to SUCCESS.
                trade.setEscalatedAt(null);
                trade.setEscalationReason(null);
            }

            case SUCCESS -> {
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(null);
                // Pay the seller before anything else in this branch. The
                // account has already changed hands by the time a trade
                // reaches SUCCESS, so an unsettled one is the asymmetry that
                // actually costs somebody: buyer has the account, seller has
                // nothing. Settling first means a failure here aborts the
                // whole transition and the trade is retried still owing money,
                // rather than closing as done with the payment lost.
                settleEscrow(trade);
                trade.setTerminalReason(trade.getMode() == TradeMode.HUMAN
                        ? "ADMIN_CLOSED_CONFIRMED" : "BUYER_CONFIRMED");
                handOver(trade, true);
                // Notify marketplace-service so the listing sinks to the end
                // of browse results and picks up the "Sotildi" badge. Skip
                // if this trade was opened from a spec (no listing context).
                if (trade.getListingId() != null) {
                    events.listingSold(
                            trade.getListingId(),
                            trade.getBuyerId(),
                            trade.getSellerId(),
                            trade.getPriceUzs());
                }
                audit.record(trade.getId(), actor, actorId, "TRADE_SUCCESS",
                        Map.of("mailboxHandedTo", trade.getBuyerId().toString()));

                if (trade.getMode() == TradeMode.HUMAN && trade.getAssignedAdminId() != null) {
                    Instant accepted = trade.getAdminAcceptedAt();
                    Instant closed = trade.getAdminClosedAt();
                    long work = (accepted != null && closed != null)
                            ? Duration.between(accepted, closed).getSeconds() : 0;
                    long total = accepted != null
                            ? Duration.between(accepted, Instant.now()).getSeconds() : 0;
                    adminStats.recordCompleted(trade.getAssignedAdminId(), work, total);
                }
                if (trade.getChatId() != null) {
                    events.tradeClosed(trade);
                }
                // Unconditional, unlike listingSold above: a trade opened from
                // a spec has no listing but its parties are still users who
                // completed a trade, and the referral reward is about them.
                events.tradeSucceeded(trade);
                events.tradeAction(trade.getId(), trade.getChatId(), trade.getSellerId(),
                        TradeEvents.TradeActionType.TRADE_SUCCESS, trade.getPriceUzs(), null, trade.getKind());
                events.tradeAction(trade.getId(), trade.getChatId(), trade.getBuyerId(),
                        TradeEvents.TradeActionType.TRADE_SUCCESS, trade.getPriceUzs(), null, trade.getKind());
            }
            case REJECTED -> {
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(null);
                releaseEscrow(trade);
                // Same reasoning as WAITING_CLOSE_CONFIRM above: the admin
                // (or a platform admin acting on ADMIN_CANCELLED) resolved
                // the trade, so a stale escalated flag must not linger into
                // a terminal state.
                trade.setEscalatedAt(null);
                trade.setEscalationReason(null);
                trade.setTerminalReason(event == TradeEvent.ADMIN_CANCELLED
                        ? "ADMIN_CANCELLED" : "BUYER_REJECTED_OR_TIMEOUT");
                handOver(trade, false);
                audit.record(trade.getId(), actor, actorId, "TRADE_REJECTED",
                        Map.of("mailboxHandedTo", trade.getSellerId().toString()));

                // Only a cancellation the admin chose counts as "cancelled".
                // A platform admin cancelling an escalated trade is recorded as
                // abandonment instead, by TradeEscalationService (Task 15) —
                // hence the actor check, so it is not counted twice.
                if (trade.getMode() == TradeMode.HUMAN
                        && trade.getAssignedAdminId() != null
                        && event == TradeEvent.ADMIN_CANCELLED
                        && actor == ActorType.TRADE_ADMIN) {
                    adminStats.recordCancelled(trade.getAssignedAdminId());
                }
                if (trade.getChatId() != null) {
                    events.tradeClosed(trade);
                }
                events.tradeAction(trade.getId(), trade.getChatId(), trade.getSellerId(),
                        TradeEvents.TradeActionType.TRADE_REJECTED, trade.getPriceUzs(), null, trade.getKind());
                events.tradeAction(trade.getId(), trade.getChatId(), trade.getBuyerId(),
                        TradeEvents.TradeActionType.TRADE_REJECTED, trade.getPriceUzs(), null, trade.getKind());
            }
            case ORPHANED -> {
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(null);
                // Pochta qutisi ochilmagan holat butunlay boshqacha
                // yakunlanadi va shu sababli birinchi tekshiriladi.
                if (event == TradeEvent.PROVISION_FAILED) {
                    onProvisionFailed(trade, actor, actorId);
                    return;
                }
                // A trade that ran out of time is a trade that did not happen.
                // Without this the buyer's money stayed frozen for a deal
                // nobody completed, with no state left that could ever free it.
                releaseEscrow(trade);
                trade.setTerminalReason("TIMEOUT_ORPHAN");
                // Hand the boxes back rather than cutting them loose. A party
                // may already have moved their account into theirs, and
                // stripping the owner left that account sitting in a mailbox
                // belonging to nobody — the trade running out of time is not a
                // reason to take somebody's account away from them. Same
                // ending as every other failure: each box goes to whoever put
                // it up, with its password rotated so the platform's copy is
                // no longer the one that works.
                handOver(trade, false);
                audit.record(trade.getId(), actor, actorId, "TRADE_ORPHANED",
                        Map.of("actor", actor.name(), "mailboxesHandedBack", "true"));
                if (trade.getChatId() != null) {
                    events.tradeClosed(trade);
                }
                events.tradeAction(trade.getId(), trade.getChatId(), trade.getSellerId(),
                        TradeEvents.TradeActionType.TRADE_ORPHANED, trade.getPriceUzs(), null, trade.getKind());
                events.tradeAction(trade.getId(), trade.getChatId(), trade.getBuyerId(),
                        TradeEvents.TradeActionType.TRADE_ORPHANED, trade.getPriceUzs(), null, trade.getKind());
            }
        }
    }

    private static Instant now(long seconds) {
        return Instant.now().plus(Duration.ofSeconds(seconds));
    }

    /**
     * Pays the seller out of escrow, less the platform's share.
     *
     * <p>HUMAN trades never touched the wallet, so there is nothing to settle.
     * A wallet failure propagates on purpose: it must abort the transition to
     * SUCCESS rather than close a trade whose seller was never paid.
     */
    private void settleEscrow(Trade trade) {
        if (trade.getMode() != TradeMode.SMART) return;
        // Muhrlangan qiymatlar uzatiladi, bugungi sozlama emas: savdo
        // ochilgan paytdagi shart bo'yicha yopiladi.
        escrow.settle(trade.getId(), trade.getBuyerId(), trade.getSellerId(),
                trade.getPriceUzs(), trade.feeBaseOrPrice(),
                trade.getPartnerUserId(),
                trade.getPartnerPercentBp() == null ? 0 : trade.getPartnerPercentBp());
        trade.setEscrowResolvedAt(Instant.now());
    }

    /**
     * Gives the escrow back, whole. No fee — the platform charges for a trade
     * that completed, and this one did not.
     *
     * <p>Unlike settle this swallows its failure. A trade can be rejected
     * before the hold ever ran (the accept path cancels an unfunded trade that
     * way), and refusing to close it would leave it stuck in a state nobody can
     * move. The money is still in escrow and reconciliation will find it; a
     * trade that cannot be closed is the worse outcome.
     */
    private void releaseEscrow(Trade trade) {
        if (trade.getMode() != TradeMode.SMART) return;
        try {
            escrow.release(trade.getId(), trade.getBuyerId(), trade.getSellerId(),
                    trade.getPriceUzs(), trade.feeBaseOrPrice());
            trade.setEscrowResolvedAt(Instant.now());
        } catch (RuntimeException e) {
            // Left unresolved on purpose: escrow_resolved_at stays NULL and
            // TradeEscrowSweeper comes back for it.
            log.error("Escrow release failed for trade {} — money stays held, "
                    + "the sweeper must pick it up", trade.getId(), e);
        }
    }
}
