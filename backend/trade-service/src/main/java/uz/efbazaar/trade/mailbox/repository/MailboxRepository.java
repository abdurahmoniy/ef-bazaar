package uz.efbazaar.trade.mailbox.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.trade.mailbox.domain.Mailbox;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MailboxRepository extends JpaRepository<Mailbox, UUID> {

    Optional<Mailbox> findByEmail(String email);

    List<Mailbox> findByOwnerUserId(UUID ownerUserId);

    Optional<Mailbox> findByIdAndOwnerUserId(UUID id, UUID ownerUserId);
}
