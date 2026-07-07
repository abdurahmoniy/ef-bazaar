package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.ListingReport;
import uz.efbazaar.marketplace.domain.ReportStatus;

import java.util.Optional;
import java.util.UUID;

public interface ListingReportRepository extends JpaRepository<ListingReport, UUID> {

    Optional<ListingReport> findByListingIdAndReporterId(UUID listingId, UUID reporterId);

    long countByListingId(UUID listingId);

    Page<ListingReport> findByStatus(ReportStatus status, Pageable pageable);

    long countByStatus(ReportStatus status);
}
