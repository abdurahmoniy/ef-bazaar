package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingReport;
import uz.efbazaar.marketplace.domain.ReportStatus;
import uz.efbazaar.marketplace.dto.AdminReportResponse;
import uz.efbazaar.marketplace.dto.ReportListingResponse;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ListingReportRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthNameClient;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ListingReportService {

    private final ListingReportRepository reports;
    private final ListingRepository listings;
    private final AuthNameClient authNameClient;

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

    // ---------- Admin moderation ----------

    /**
     * Page of reports for the admin queue, optionally filtered by status.
     * Listing summaries are batch-loaded and display names come from one
     * {@link AuthNameClient} call — no N+1 in either direction. Names are
     * fail-soft ({@code null} when auth-service is unreachable).
     */
    @Transactional(readOnly = true)
    public Page<AdminReportResponse> findForAdmin(ReportStatus status, Pageable pageable) {
        Page<ListingReport> page = status == null
                ? reports.findAll(pageable)
                : reports.findByStatus(status, pageable);

        Map<UUID, Listing> listingById = listings.findAllById(
                        page.getContent().stream().map(ListingReport::getListingId).distinct().toList())
                .stream()
                .collect(Collectors.toMap(Listing::getId, Function.identity()));

        Set<UUID> userIds = new HashSet<>();
        for (ListingReport report : page.getContent()) {
            userIds.add(report.getReporterId());
            Listing listing = listingById.get(report.getListingId());
            if (listing != null) userIds.add(listing.getSellerId());
        }
        Map<UUID, String> names = authNameClient.resolveNames(userIds);

        return page.map(report -> {
            Listing listing = listingById.get(report.getListingId());
            return new AdminReportResponse(
                    report.getId(),
                    report.getListingId(),
                    listing == null ? null : listing.getDescription(),
                    listing == null ? null : listing.getStatus(),
                    listing == null ? null : listing.getSellerId(),
                    listing == null ? null : names.get(listing.getSellerId()),
                    report.getReporterId(),
                    names.get(report.getReporterId()),
                    report.getReason(),
                    report.getDetails(),
                    report.getStatus(),
                    report.getCreatedAt());
        });
    }

    @Transactional
    public void updateStatus(UUID reportId, ReportStatus status) {
        ListingReport report = reports.findById(reportId)
                .orElseThrow(MarketplaceException::reportNotFound);
        report.setStatus(status);
        reports.save(report);
        log.info("Listing report status updated: id={} status={}", reportId, status);
    }
}
