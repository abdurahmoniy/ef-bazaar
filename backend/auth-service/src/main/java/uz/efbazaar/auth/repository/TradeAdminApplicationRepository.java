package uz.efbazaar.auth.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.auth.domain.TradeAdminApplication;
import uz.efbazaar.auth.domain.TradeAdminApplicationStatus;

import java.util.Optional;
import java.util.UUID;

public interface TradeAdminApplicationRepository
        extends JpaRepository<TradeAdminApplication, UUID> {

    Optional<TradeAdminApplication> findFirstByApplicantUserIdOrderByCreatedAtDesc(UUID applicantUserId);

    Optional<TradeAdminApplication> findFirstByApplicantUserIdAndStatusOrderByCreatedAtDesc(
            UUID applicantUserId,
            TradeAdminApplicationStatus status);

    Page<TradeAdminApplication> findByStatus(
            TradeAdminApplicationStatus status,
            Pageable pageable);
}
