package uz.efbazaar.auth.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.auth.dto.TradeAdminApplicationCreateRequest;
import uz.efbazaar.auth.dto.TradeAdminApplicationResponse;
import uz.efbazaar.auth.security.AuthenticatedUser;
import uz.efbazaar.auth.service.TradeAdminApplicationService;

@RestController
@RequestMapping("/api/v1/trade-admin-applications")
@RequiredArgsConstructor
public class TradeAdminApplicationController {

    private final TradeAdminApplicationService service;

    @PostMapping
    public TradeAdminApplicationResponse submit(
            @AuthenticationPrincipal AuthenticatedUser user,
            @Valid @RequestBody TradeAdminApplicationCreateRequest request) {
        return service.submit(user.userId(), request);
    }

    @GetMapping("/me")
    public ResponseEntity<TradeAdminApplicationResponse> me(
            @AuthenticationPrincipal AuthenticatedUser user) {
        return service.latestForUser(user.userId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
