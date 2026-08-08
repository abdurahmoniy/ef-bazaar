package uz.efbazaar.auth.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.auth.domain.TradeAdminApplicationStatus;
import uz.efbazaar.auth.dto.PageResponse;
import uz.efbazaar.auth.dto.TradeAdminApplicationDecisionRequest;
import uz.efbazaar.auth.dto.TradeAdminApplicationResponse;
import uz.efbazaar.auth.security.AuthenticatedUser;
import uz.efbazaar.auth.service.TradeAdminApplicationService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/trade-admin-applications")
@RequiredArgsConstructor
public class AdminTradeAdminApplicationController {

    private final TradeAdminApplicationService service;

    @GetMapping
    public PageResponse<TradeAdminApplicationResponse> list(
            @RequestParam(required = false) TradeAdminApplicationStatus status,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
            Pageable pageable) {
        Page<TradeAdminApplicationResponse> page = service.list(status, pageable);
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }

    @PostMapping("/{id}/approve")
    public TradeAdminApplicationResponse approve(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) TradeAdminApplicationDecisionRequest request) {
        return service.approve(admin.userId(), id, request == null
                ? new TradeAdminApplicationDecisionRequest(null)
                : request);
    }

    @PostMapping("/{id}/reject")
    public TradeAdminApplicationResponse reject(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) TradeAdminApplicationDecisionRequest request) {
        return service.reject(admin.userId(), id, request == null
                ? new TradeAdminApplicationDecisionRequest(null)
                : request);
    }
}
