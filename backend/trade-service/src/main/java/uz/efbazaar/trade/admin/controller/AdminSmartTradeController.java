package uz.efbazaar.trade.admin.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.trade.admin.dto.AdminEmailChangeCodeRequest;
import uz.efbazaar.trade.admin.dto.AdminKonamiConfirmRequest;
import uz.efbazaar.trade.admin.dto.AdminSmartTradeDetail;
import uz.efbazaar.trade.admin.dto.AdminSmartTradeRow;
import uz.efbazaar.trade.admin.service.AdminSmartTradeService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/**
 * "Faol savdolar": live SMART trades, and the two worker steps an admin may
 * complete by hand when the worker cannot read Konami's mail.
 */
@RestController
@RequestMapping("/api/v1/admin/smart-trades")
@RequiredArgsConstructor
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
public class AdminSmartTradeController {

    private final AdminSmartTradeService service;

    @GetMapping
    public List<AdminSmartTradeRow> active() {
        return service.active();
    }

    @GetMapping("/{id}")
    public AdminSmartTradeDetail detail(@PathVariable UUID id) {
        return service.detail(id);
    }

    @PostMapping("/{id}/email-change-code")
    public void emailChangeCode(@AuthenticationPrincipal AuthenticatedUser me,
                                @PathVariable UUID id,
                                @Valid @RequestBody AdminEmailChangeCodeRequest req) {
        service.submitEmailChangeCode(me.userId(), id, req.role(), req.code());
    }

    /** Favqulodda: worker kodni yetkaza olmaganda admin o'zi o'qib yuboradi. */
    @PostMapping("/{id}/login-code")
    public void loginCode(@AuthenticationPrincipal AuthenticatedUser me,
                          @PathVariable UUID id,
                          @Valid @RequestBody uz.efbazaar.trade.admin.dto.AdminLoginCodeRequest req) {
        service.submitLoginCode(me.userId(), id, req.role(), req.code());
    }

    @PostMapping("/{id}/konami-email-confirm")
    public void konamiEmailConfirm(@AuthenticationPrincipal AuthenticatedUser me,
                                   @PathVariable UUID id,
                                   @Valid @RequestBody AdminKonamiConfirmRequest req) {
        service.confirmKonamiEmail(me.userId(), id, req.role());
    }
}
