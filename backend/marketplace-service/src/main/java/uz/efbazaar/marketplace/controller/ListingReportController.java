package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.dto.ReportListingRequest;
import uz.efbazaar.marketplace.dto.ReportListingResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ListingReportService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/listings/{id}/report")
@RequiredArgsConstructor
public class ListingReportController {

    private final ListingReportService reportService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReportListingResponse report(@PathVariable UUID id,
                                        @AuthenticationPrincipal AuthenticatedUser user,
                                        @Valid @RequestBody ReportListingRequest request) {
        return reportService.report(id, user.userId(), request.reason(), request.details());
    }
}
