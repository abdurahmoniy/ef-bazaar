package uz.efbazaar.marketplace.botsettings;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BotBroadcastRepository extends JpaRepository<BotBroadcast, UUID> {

    Page<BotBroadcast> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Optional<BotBroadcast> findFirstByStatusInOrderByCreatedAtDesc(List<BotBroadcast.Status> statuses);
}
