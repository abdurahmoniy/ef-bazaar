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

    @Transactional
    public MailboxLinkSession open(UUID owner, UUID mailboxId, UUID accountId, boolean emailAlreadySet) {
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
                .orElseThrow(() -> new EntityNotFoundException("Link session " + sid + " not found"));
    }

    @Transactional
    public MailboxLinkSession emailChanged(UUID owner, UUID sid) {
        MailboxLinkSession s = lockOwned(owner, sid);
        if (s.getState() != LinkSessionState.WAIT_EMAIL_CHANGE) throw invalidState();
        enter(s, LinkSessionState.WAIT_RESET);
        return s;
    }

    @Transactional
    public MailboxLinkSession retry(UUID owner, UUID sid) {
        MailboxLinkSession s = lockOwned(owner, sid);
        if (s.getState() != LinkSessionState.EXPIRED) throw invalidState();
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
        MailboxLinkSession s = sessions.findForUpdate(sid).orElse(null);
        if (s == null || !s.getState().live()) return;
        if (notRegistered) {
            s.setNotRegistered(true);
            enter(s, LinkSessionState.WAIT_EMAIL_CHANGE);
            return;
        }
        s.setState(LinkSessionState.VERIFIED);
        s.setNotRegistered(false);
        mailboxes.setLinkedAccount(s.getMailboxId(), s.getAccountId());
        stopWatching(s);
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

    /** The live session watching this address, if any — routes worker answers here instead of to a trade. */
    @Transactional(readOnly = true)
    public Optional<UUID> liveSessionFor(String mailboxEmail) {
        if (mailboxEmail == null) return Optional.empty();
        return mailboxes.findByEmail(mailboxEmail)
                .flatMap(mb -> sessions.findLiveByMailboxId(mb.getId()))
                .map(MailboxLinkSession::getId);
    }

    @Transactional(readOnly = true)
    public String emailOf(MailboxLinkSession s) {
        return mailboxes.findById(s.getMailboxId()).map(Mailbox::getEmail).orElse(null);
    }

    private MailboxLinkSession lockOwned(UUID owner, UUID sid) {
        MailboxLinkSession s = sessions.findForUpdate(sid)
                .orElseThrow(() -> new EntityNotFoundException("Link session " + sid + " not found"));
        if (!s.getOwnerId().equals(owner)) throw new EntityNotFoundException("Link session " + sid + " not found");
        return s;
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
