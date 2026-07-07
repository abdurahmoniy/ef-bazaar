package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.domain.ReportStatus;
import uz.efbazaar.marketplace.dto.AdminStatsResponse;
import uz.efbazaar.marketplace.repository.ListingReportRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

@Service
@RequiredArgsConstructor
public class AdminStatsService {

    private final ListingRepository listings;
    private final ListingReportRepository reports;

    @Transactional(readOnly = true)
    public AdminStatsResponse stats() {
        return new AdminStatsResponse(
                listings.count(),
                listings.countByStatus(ListingStatus.ACTIVE),
                listings.countByStatus(ListingStatus.SOLD),
                listings.countByStatus(ListingStatus.DELETED),
                reports.count(),
                reports.countByStatus(ReportStatus.PENDING));
    }
}
