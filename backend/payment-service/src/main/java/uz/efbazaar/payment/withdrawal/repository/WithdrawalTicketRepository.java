package uz.efbazaar.payment.withdrawal.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.withdrawal.domain.WithdrawalStatus;
import uz.efbazaar.payment.withdrawal.domain.WithdrawalTicket;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WithdrawalTicketRepository extends JpaRepository<WithdrawalTicket, UUID> {

    Optional<WithdrawalTicket> findByUserIdAndStatus(UUID userId, WithdrawalStatus status);

    List<WithdrawalTicket> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<WithdrawalTicket> findByStatusOrderByCreatedAtAsc(WithdrawalStatus status);
}
