package uz.efbazaar.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.AccountRequestStatus;
import uz.efbazaar.marketplace.domain.ChatAccountRequest;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChatAccountRequestRepository extends JpaRepository<ChatAccountRequest, UUID> {

    Optional<ChatAccountRequest> findByChatIdAndStatus(UUID chatId, AccountRequestStatus status);
    /** Every selection, including superseded and fulfilled requests, in transcript order. */
    List<ChatAccountRequest> findByChatIdOrderByCreatedAtAscIdAsc(UUID chatId);
}
