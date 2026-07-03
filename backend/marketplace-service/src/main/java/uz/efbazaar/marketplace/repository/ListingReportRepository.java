package uz.efbazaar.marketplace.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.domain.ListingReport;

import java.util.Optional;
import java.util.UUID;

public interface ListingReportRepository extends JpaRepository<ListingReport, UUID> {

    Optional<ListingReport> findByListingIdAndReporterId(UUID listingId, UUID reporterId);

    long countByListingId(UUID listingId);
}
