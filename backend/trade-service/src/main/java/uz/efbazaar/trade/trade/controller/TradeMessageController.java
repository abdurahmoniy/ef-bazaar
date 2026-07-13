package uz.efbazaar.trade.trade.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.PasswordRevealResponse;
import uz.efbazaar.trade.trade.dto.SendPasswordRequest;
import uz.efbazaar.trade.trade.service.OneTimePasswordService;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades/{id}/messages")
@RequiredArgsConstructor
public class TradeMessageController {

    private final OneTimePasswordService otp;

    @PostMapping("/password")
    public Map<String, UUID> sendPassword(@AuthenticationPrincipal AuthenticatedUser me,
                                          @PathVariable UUID id,
                                          @Valid @RequestBody SendPasswordRequest req) {
        UUID msgId = otp.sendPassword(id, req.password(), me.userId());
        return Map.of("messageId", msgId);
    }

    @PostMapping("/{msgId}/reveal")
    public PasswordRevealResponse reveal(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @PathVariable UUID msgId) {
        return new PasswordRevealResponse(otp.reveal(id, msgId, me.userId()));
    }

    // Text messages endpoint added in Task 16.
}
