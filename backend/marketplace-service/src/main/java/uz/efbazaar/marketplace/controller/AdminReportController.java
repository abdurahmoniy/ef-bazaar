package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.domain.ReportStatus;
import uz.efbazaar.marketplace.dto.AdminReportResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.service.ListingReportService;

import java.util.UUID;

/**
 * Moderation queue for listing reports. Gated by {@code ROLE_ADMIN} in
 * {@link uz.efbazaar.marketplace.config.SecurityConfig}.
 */
@RestController
@RequestMapping("/api/v1/admin/reports")
@RequiredArgsConstructor
public class AdminReportController {

    private final ListingReportService reportService;

    @GetMapping
    public PageResponse<AdminReportResponse> list(
            @RequestParam(required = false) ReportStatus status,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Page<AdminReportResponse> page = reportService.findForAdmin(status, pageable);
        return new PageResponse<>(page.getContent(),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }

    @PostMapping("/{id}/resolve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(@PathVariable UUID id) {
        reportService.updateStatus(id, ReportStatus.RESOLVED);
    }

    @PostMapping("/{id}/dismiss")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dismiss(@PathVariable UUID id) {
        reportService.updateStatus(id, ReportStatus.DISMISSED);
    }
}
