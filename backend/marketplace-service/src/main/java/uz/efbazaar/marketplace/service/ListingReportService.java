package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingReport;
import uz.efbazaar.marketplace.domain.ReportStatus;
import uz.efbazaar.marketplace.dto.ReportListingResponse;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ListingReportRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ListingReportService {

    private final ListingReportRepository reports;
    private final ListingRepository listings;

    @Transactional
    public ReportListingResponse report(UUID listingId, UUID reporterId, String reason, String details) {
        Listing listing = listings.findById(listingId)
                .orElseThrow(MarketplaceException::listingNotFound);
        if (listing.getSellerId().equals(reporterId)) {
            throw MarketplaceException.cannotReportOwnListing();
        }

        var existing = reports.findByListingIdAndReporterId(listingId, reporterId);
        if (existing.isPresent()) {
            ListingReport r = existing.get();
            return new ReportListingResponse(r.getId(), r.getListingId(), r.getReason(),
                    r.getStatus(), r.getCreatedAt(), true);
        }

        ListingReport saved = reports.save(ListingReport.builder()
                .listingId(listingId)
                .reporterId(reporterId)
                .reason(reason)
                .details(details)
                .status(ReportStatus.PENDING)
                .build());
        log.info("Listing report created: id={} listingId={} reporterId={} reason={}",
                saved.getId(), listingId, reporterId, reason);
        return new ReportListingResponse(saved.getId(), saved.getListingId(), saved.getReason(),
                saved.getStatus(), saved.getCreatedAt(), false);
    }
}
