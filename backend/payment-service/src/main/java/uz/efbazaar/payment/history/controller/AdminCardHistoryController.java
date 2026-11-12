package uz.efbazaar.payment.history.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.history.dto.CardMovementResponse;
import uz.efbazaar.payment.history.service.CardHistoryService;

import java.util.List;

/**
 * What has moved on the platform's cards. Admin only: these are the platform's
 * own accounts, and a credit names the user whose wallet it went to.
 */
@RestController
@RequestMapping("/api/v1/admin/payments/cards/history")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminCardHistoryController {

    private final CardHistoryService history;

    @GetMapping
    public List<CardMovementResponse> recent(
            @RequestParam(required = false) String last4,
            @RequestParam(defaultValue = "0") int limit) {
        return history.recent(last4, limit);
    }
}
