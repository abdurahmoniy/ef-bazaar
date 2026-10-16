package uz.efbazaar.trade.mailbox.link;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MailboxLinkSessionRepository extends JpaRepository<MailboxLinkSession, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from MailboxLinkSession s where s.id = :id")
    Optional<MailboxLinkSession> findForUpdate(@Param("id") UUID id);

    Optional<MailboxLinkSession> findByIdAndOwnerId(UUID id, UUID ownerId);

    @Query("select s from MailboxLinkSession s where s.mailboxId = :mailboxId "
            + "and s.state in (uz.efbazaar.trade.mailbox.link.LinkSessionState.WAIT_EMAIL_CHANGE, "
            + "uz.efbazaar.trade.mailbox.link.LinkSessionState.WAIT_RESET)")
    Optional<MailboxLinkSession> findLiveByMailboxId(@Param("mailboxId") UUID mailboxId);

    @Query("select s from MailboxLinkSession s where s.mailboxId in :ids "
            + "and s.state in (uz.efbazaar.trade.mailbox.link.LinkSessionState.WAIT_EMAIL_CHANGE, "
            + "uz.efbazaar.trade.mailbox.link.LinkSessionState.WAIT_RESET)")
    List<MailboxLinkSession> findLiveByMailboxIds(@Param("ids") Collection<UUID> ids);

    @Query("select s.id from MailboxLinkSession s where s.stepDeadline < :now "
            + "and s.state in (uz.efbazaar.trade.mailbox.link.LinkSessionState.WAIT_EMAIL_CHANGE, "
            + "uz.efbazaar.trade.mailbox.link.LinkSessionState.WAIT_RESET)")
    List<UUID> findDueIds(@Param("now") Instant now);
}
