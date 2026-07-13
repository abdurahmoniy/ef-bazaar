package uz.efbazaar.trade.trade.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.PasswordRevealResponse;
import uz.efbazaar.trade.trade.dto.PostTextRequest;
import uz.efbazaar.trade.trade.dto.SendPasswordRequest;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.service.OneTimePasswordService;
import uz.efbazaar.trade.trade.service.TradeChatService;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades/{id}/messages")
@RequiredArgsConstructor
public class TradeMessageController {

    private final OneTimePasswordService otp;
    private final TradeChatService chat;

    @GetMapping
    public List<TradeMessageResponse> list(@AuthenticationPrincipal AuthenticatedUser me,
                                           @PathVariable UUID id) {
        return chat.list(id, me.userId());
    }

    @PostMapping
    public TradeMessageResponse postText(@AuthenticationPrincipal AuthenticatedUser me,
                                         @PathVariable UUID id,
                                         @Valid @RequestBody PostTextRequest req) {
        var m = chat.postText(id, me.userId(), req.text());
        return new TradeMessageResponse(m.getId(), m.getSenderType(), m.getMessageType(),
                req.text(), m.getMetadata(), m.getCreatedAt());
    }

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
}
