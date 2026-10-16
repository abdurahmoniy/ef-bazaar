package uz.efbazaar.trade.mailbox.link;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.trade.common.exception.ApiCodeException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.kafka.TradeEvents.ImapPurpose;
import uz.efbazaar.trade.mail.service.MailboxPasswordResolver;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxKind;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.plan.service.MailboxAccessService;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Proves a Konami account is attached to one of the user's mailboxes.
 *
 * <p>The user moves the account's email to the box (Konami mails a code there,
 * which we relay), then asks Konami for a password reset. The reset mail
 * landing in the box is the proof; nobody has to use it. Each step lasts
 * {@code trade.mailbox.link-step-minutes}.
 *
 * <p>Every worker request goes out after commit (the publisher defers), and
 * each step restarts the poller: a reset poller goes idle after its first hit
 * and would never see the next mail.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LinkSessionService {

    private final MailboxLinkSessionRepository sessions;
    private final MailboxRepository mailboxes;
    private final MailboxAccessService access;
    private final TradeRepository trades;
    private final MailboxPasswordResolver passwords;
    private final TradeEventPublisher events;

    @Value("${trade.mailbox.link-step-minutes:15}")
    private long stepMinutes;

    /** Mail server and our clock may disagree by this much. */
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(1);

    @Transactional
    public MailboxLinkSession open(UUID owner, UUID mailboxId, UUID accountId, boolean emailAlreadySet) {
        Mailbox mb = assertLinkable(owner, mailboxId, accountId);
        if (sessions.findLiveByMailboxId(mailboxId).isPresent()) {
            throw liveConflict();
        }
        LinkSessionState first = emailAlreadySet ? LinkSessionState.WAIT_RESET : LinkSessionState.WAIT_EMAIL_CHANGE;
        MailboxLinkSession s = MailboxLinkSession.builder()
                .id(UUID.randomUUID())
                .ownerId(owner)
                .mailboxId(mailboxId)
                .accountId(accountId)
                .state(first)
                .stepDeadline(deadline())
                .build();
        try {
            sessions.saveAndFlush(s);
        } catch (DataIntegrityViolationException e) {
            throw liveConflict();
        }
        watch(s, mb);
        log.info("User {} opened link session {} on mailbox {} for account {}", owner, s.getId(), mailboxId, accountId);
        return s;
    }

    @Transactional(readOnly = true)
    public MailboxLinkSession get(UUID owner, UUID sid) {
        return sessions.findByIdAndOwnerId(sid, owner)
                .filter(this::ownerStillHoldsBox)
                .orElseThrow(() -> new EntityNotFoundException("Link session " + sid + " not found"));
    }

    @Transactional
    public MailboxLinkSession emailChanged(UUID owner, UUID sid) {
        MailboxLinkSession s = lockOwned(owner, sid);
        if (s.getState() != LinkSessionState.WAIT_EMAIL_CHANGE) throw invalidState();
        assertLinkable(owner, s.getMailboxId(), s.getAccountId());
        enter(s, LinkSessionState.WAIT_RESET);
        return s;
    }

    @Transactional
    public MailboxLinkSession retry(UUID owner, UUID sid) {
        MailboxLinkSession s = lockOwned(owner, sid);
        if (s.getState() != LinkSessionState.EXPIRED) throw invalidState();
        // The box may have moved on since this attempt expired: another account
        // linked, the box locked or lent to a trade. Same bar as a new session.
        assertLinkable(owner, s.getMailboxId(), s.getAccountId());
        if (sessions.findLiveByMailboxId(s.getMailboxId()).isPresent()) throw liveConflict();
        LinkSessionState step = s.getExpiredFrom() == null ? LinkSessionState.WAIT_EMAIL_CHANGE : s.getExpiredFrom();
        s.setExpiredFrom(null);
        enter(s, step);
        try {
            sessions.flush();
        } catch (DataIntegrityViolationException e) {
            throw liveConflict();
        }
        return s;
    }

    @Transactional
    public void cancel(UUID owner, UUID sid) {
        MailboxLinkSession s = lockOwned(owner, sid);
        if (s.getState() == LinkSessionState.CANCELLED) return;
        if (s.getState() == LinkSessionState.VERIFIED) throw invalidState();
        boolean wasLive = s.getState().live();
        s.setState(LinkSessionState.CANCELLED);
        if (wasLive) stopWatching(s);
    }

    /** The reset mail (or Konami's "not registered" answer) landed in the box. */
    @Transactional
    public void onResetMail(UUID sid, boolean notRegistered) {
        onResetMail(sid, notRegistered, null);
    }

    /**
     * @param receivedAt when the mail arrived; a mail older than this step
     *                   (left unread from an earlier reset) proves nothing about
     *                   this attempt and is skipped — the poller is restarted,
     *                   since it marked the old mail seen and went idle.
     */
    @Transactional
    public void onResetMail(UUID sid, boolean notRegistered, Instant receivedAt) {
        MailboxLinkSession s = sessions.findForUpdate(sid).orElse(null);
        if (s == null || !s.getState().live()) return;
        Mailbox mb = mailboxes.findById(s.getMailboxId()).orElse(null);
        if (mb == null || mb.getDeletedAt() != null || !s.getOwnerId().equals(mb.getOwnerUserId())
                || (mb.getLinkedAccountId() != null && !mb.getLinkedAccountId().equals(s.getAccountId()))) {
            // The box changed hands or now belongs to another account: this
            // attempt can no longer link anything.
            s.setState(LinkSessionState.CANCELLED);
            if (mb != null) events.imapPollStopRequest(mb.getEmail());
            log.warn("Link session {} cancelled: mailbox {} no longer linkable for account {}",
                    sid, s.getMailboxId(), s.getAccountId());
            return;
        }
        if (receivedAt != null && receivedAt.isBefore(stepStartedAt(s).minus(CLOCK_SKEW))) {
            log.info("Link session {}: reset mail from {} predates the step, ignored", sid, receivedAt);
            watch(s, mb);
            return;
        }
        if (notRegistered) {
            s.setNotRegistered(true);
            enter(s, LinkSessionState.WAIT_EMAIL_CHANGE);
            return;
        }
        s.setState(LinkSessionState.VERIFIED);
        s.setNotRegistered(false);
        mailboxes.setLinkedAccount(s.getMailboxId(), s.getAccountId());
        stopWatching(s);
        announce(s);
        log.info("Link session {} verified: mailbox {} is account {}'s", sid, s.getMailboxId(), s.getAccountId());
    }

    /** Konami's email-change code; an older one never replaces a newer one. */
    @Transactional
    public void onEmailChangeCode(UUID sid, String code, Instant receivedAt) {
        MailboxLinkSession s = sessions.findForUpdate(sid).orElse(null);
        if (s == null || !s.getState().live()) return;
        if (s.getCodeReceivedAt() != null && receivedAt != null && receivedAt.isBefore(s.getCodeReceivedAt())) return;
        s.setEmailChangeCode(code);
        s.setCodeReceivedAt(receivedAt == null ? Instant.now() : receivedAt);
    }

    @Transactional
    public int expireDue(Instant now) {
        List<UUID> due = sessions.findDueIds(now);
        int n = 0;
        for (UUID id : due) {
            MailboxLinkSession s = sessions.findForUpdate(id).orElse(null);
            if (s == null || !s.getState().live() || !s.getStepDeadline().isBefore(now)) continue;
            s.setExpiredFrom(s.getState());
            s.setState(LinkSessionState.EXPIRED);
            stopWatching(s);
            n++;
        }
        return n;
    }

    /** Sends the verified event again — marketplace missed it; it is idempotent there. */
    @Transactional(readOnly = true)
    public void republish(UUID owner, UUID sid) {
        MailboxLinkSession s = get(owner, sid);
        if (s.getState() != LinkSessionState.VERIFIED) throw invalidState();
        // Only while the box still holds that account: an old session must not
        // bring back a link that was since replaced or released.
        boolean stillLinked = mailboxes.findById(s.getMailboxId())
                .map(mb -> s.getAccountId().equals(mb.getLinkedAccountId()))
                .orElse(false);
        if (!stillLinked) throw invalidState();
        announce(s);
    }

    /** The live session watching this address, if any — routes worker answers here instead of to a trade. */
    @Transactional(readOnly = true)
    public Optional<UUID> liveSessionFor(String mailboxEmail) {
        if (mailboxEmail == null) return Optional.empty();
        return mailboxes.findByEmail(mailboxEmail)
                .flatMap(mb -> sessions.findLiveByMailboxId(mb.getId())
                        .filter(sess -> sess.getOwnerId().equals(mb.getOwnerUserId())))
                .map(MailboxLinkSession::getId);
    }

    /**
     * The box changed hands or was released: its sessions end and its link is
     * dropped, so the previous owner can no longer drive it or read Konami's
     * codes from it. Joins the caller's transaction.
     */
    @Transactional
    public void endForMailbox(UUID mailboxId) {
        Mailbox mb = mailboxes.findById(mailboxId).orElse(null);
        sessions.findLiveByMailboxId(mailboxId).ifPresent(s -> {
            s.setState(LinkSessionState.CANCELLED);
            if (mb != null) events.imapPollStopRequest(mb.getEmail());
        });
        sessions.cancelExpiredForMailbox(mailboxId);
        if (mb != null && mb.getLinkedAccountId() != null) {
            mailboxes.clearLinkedAccount(mailboxId, mb.getLinkedAccountId());
        }
    }

    @Transactional(readOnly = true)
    public String emailOf(MailboxLinkSession s) {
        return mailboxes.findById(s.getMailboxId()).map(Mailbox::getEmail).orElse(null);
    }

    private MailboxLinkSession lockOwned(UUID owner, UUID sid) {
        MailboxLinkSession s = sessions.findForUpdate(sid)
                .orElseThrow(() -> new EntityNotFoundException("Link session " + sid + " not found"));
        if (!s.getOwnerId().equals(owner) || !ownerStillHoldsBox(s)) {
            throw new EntityNotFoundException("Link session " + sid + " not found");
        }
        return s;
    }

    private boolean ownerStillHoldsBox(MailboxLinkSession s) {
        return mailboxes.findById(s.getMailboxId())
                .map(mb -> mb.getDeletedAt() == null && s.getOwnerId().equals(mb.getOwnerUserId()))
                .orElse(false);
    }

    /** What every attempt has to pass, at its start and whenever it moves on. */
    private Mailbox assertLinkable(UUID owner, UUID mailboxId, UUID accountId) {
        Mailbox mb = mailboxes.lockOwned(mailboxId, owner)
                .orElseThrow(() -> new EntityNotFoundException("Mailbox " + mailboxId + " not found"));
        if (mb.getProvisionedAt() == null) {
            throw new ApiCodeException(HttpStatus.CONFLICT, "mailbox_pending", "Quti hali tayyorlanmoqda");
        }
        if (access.isLocked(owner, mailboxId)) {
            throw new ApiCodeException(HttpStatus.FORBIDDEN, "mailbox_locked", "Quti qulflangan");
        }
        if (mb.getKind() == MailboxKind.RANDOM
                && trades.existsLiveWithMailbox(mailboxId, TradeState.nonTerminal())) {
            throw new ApiCodeException(HttpStatus.CONFLICT, "mailbox_in_trade",
                    "Bu quti davom etayotgan savdoda ishlatilmoqda");
        }
        if (mb.getLinkedAccountId() != null && !mb.getLinkedAccountId().equals(accountId)) {
            throw new ApiCodeException(HttpStatus.CONFLICT, "mailbox_linked",
                    "Bu quti boshqa akkountga ulangan");
        }
        return mb;
    }

    private Instant stepStartedAt(MailboxLinkSession s) {
        return s.getStepDeadline().minus(Duration.ofMinutes(stepMinutes));
    }

    private void enter(MailboxLinkSession s, LinkSessionState step) {
        s.setState(step);
        s.setStepDeadline(deadline());
        if (step == LinkSessionState.WAIT_RESET) s.setNotRegistered(false);
        watch(s, mailboxes.findById(s.getMailboxId()).orElseThrow());
    }

    private void watch(MailboxLinkSession s, Mailbox mb) {
        ImapPurpose purpose = s.getState() == LinkSessionState.WAIT_RESET
                ? ImapPurpose.VERIFY_LINK : ImapPurpose.WAIT_EMAIL_CHANGE_CODE;
        TradeEvents.PollCredentials creds = passwords.contextFor(mb)
                .map(ctx -> new TradeEvents.PollCredentials(ctx, mb.getEncryptedPassword(),
                        mb.getPasswordIv(), mb.getPasswordTag()))
                .orElse(null);
        if (creds == null) {
            log.warn("No known context opens mailbox {}; the worker will rely on its cache", mb.getId());
        }
        events.imapPollRequest(s.getId(), mb.getEmail(), purpose, true, creds);
    }

    private void announce(MailboxLinkSession s) {
        Mailbox mb = mailboxes.findById(s.getMailboxId()).orElseThrow();
        events.accountEmailVerified(new TradeEvents.AccountEmailVerified(s.getId(), s.getAccountId(),
                s.getOwnerId(), mb.getId(), mb.getEmail(), mb.getKind() == MailboxKind.CUSTOM,
                s.getUpdatedAt() == null ? Instant.now() : s.getUpdatedAt()));
    }

    private void stopWatching(MailboxLinkSession s) {
        mailboxes.findById(s.getMailboxId()).ifPresent(mb -> events.imapPollStopRequest(mb.getEmail()));
    }

    private Instant deadline() {
        return Instant.now().plus(Duration.ofMinutes(stepMinutes));
    }

    private static ApiCodeException liveConflict() {
        return new ApiCodeException(HttpStatus.CONFLICT, "session_live", "Bu qutida ulash jarayoni davom etmoqda");
    }

    private static ApiCodeException invalidState() {
        return new ApiCodeException(HttpStatus.CONFLICT, "invalid_state", "Bu bosqichda bu amal mumkin emas");
    }
}
