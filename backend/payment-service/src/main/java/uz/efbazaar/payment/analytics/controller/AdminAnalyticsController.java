package uz.efbazaar.payment.analytics.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.analytics.dto.AnalyticsOverviewResponse;
import uz.efbazaar.payment.analytics.service.AnalyticsService;

/**
 * The finance dashboard's single read. Admin only — these are the platform's
 * own books, not a per-user figure.
 */
@RestController
@RequestMapping("/api/v1/admin/payments/analytics")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminAnalyticsController {

    private final AnalyticsService analytics;

    @GetMapping("/overview")
    public AnalyticsOverviewResponse overview() {
        return analytics.overview();
    }
}
