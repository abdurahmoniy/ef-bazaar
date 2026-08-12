package uz.efbazaar.payment.card.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.card.domain.PlatformCardAudit;

public interface PlatformCardAuditRepository extends JpaRepository<PlatformCardAudit, Long> {
}
