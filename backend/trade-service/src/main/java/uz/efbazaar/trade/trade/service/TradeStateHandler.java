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
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;

import java.time.Duration;
import java.time.Instant;
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
    public void onEnter(Trade trade, TradeState newState, ActorType actor, UUID actorId, TradeEvent event) {
        switch (newState) {
            case INITIATED -> {
                trade.setStateDeadline(null);
                // Both modes need an escrow mailbox — only the Konami/IMAP
                // automation is smart-only. Spec §3.2.
                events.emailProvisionRequest(trade.getId(), trade.getMailboxId());
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
                    var mb = mailboxes.getRaw(trade.getMailboxId());
                    events.imapPollRequest(trade.getId(), mb.getEmail(),
                            TradeEvents.ImapPurpose.WAIT_EMAIL_CHANGE_CODE);
                }
            }
            case VERIFYING_KONAMI_LINK -> {
                trade.setStateDeadline(now(tvklS));
                if (trade.getMode() == TradeMode.SMART && event != TradeEvent.RECHECK) {
                    // fire-and-forget forgot-password. The mailbox email is stored on the mailbox row.
                    var mb = mailboxes.getRaw(trade.getMailboxId());
                    events.forgotPasswordRequest(trade.getId(), mb.getEmail(), null);
                }
            }
            case WAITING_PASSWORD     -> trade.setStateDeadline(now(twpwS));
            case WAITING_BUYER_VERIFY -> trade.setStateDeadline(now(twbvS));

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
                mailboxes.assignOwner(trade.getMailboxId(), trade.getAssignedAdminId());
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
                events.mailboxRotateRequest(trade.getMailboxId());
                mailboxes.assignOwner(trade.getMailboxId(), trade.getBuyerId());
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
                events.mailboxRotateRequest(trade.getMailboxId());
                mailboxes.assignOwner(trade.getMailboxId(), trade.getSellerId());
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
            }
            case ORPHANED -> {
                trade.setStateDeadline(null);
                trade.setEscalationDeadlineAt(null);
                trade.setTerminalReason("TIMEOUT_ORPHAN");
                mailboxes.stripFromTrade(trade.getMailboxId());
                audit.record(trade.getId(), actor, actorId, "TRADE_ORPHANED",
                        Map.of("actor", actor.name()));
                if (trade.getChatId() != null) {
                    events.tradeClosed(trade);
                }
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
        escrow.settle(trade.getId(), trade.getBuyerId(), trade.getSellerId(), trade.getPriceUzs());
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
            escrow.release(trade.getId(), trade.getBuyerId(), trade.getPriceUzs());
        } catch (RuntimeException e) {
            log.error("Escrow release failed for trade {} — money stays held, "
                    + "reconciliation must pick it up", trade.getId(), e);
        }
    }
}
