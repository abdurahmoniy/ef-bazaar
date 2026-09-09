package uz.efbazaar.marketplace.support.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.support.dto.SupportAdminReplyRequest;
import uz.efbazaar.marketplace.support.service.SupportChatService;

@RestController
@RequestMapping("/internal/marketplace/v1/support")
@RequiredArgsConstructor
public class InternalSupportController {

    private final SupportChatService supportChatService;

    @PostMapping("/telegram-reply")
    @ResponseStatus(HttpStatus.OK)
    public void handleTelegramReply(@Valid @RequestBody SupportAdminReplyRequest request) {
        supportChatService.handleAdminReply(
                request.replyToTelegramMessageId(),
                request.telegramMessageId(),
                request.adminName(),
                request.adminUsername(),
                request.text()
        );
    }
}
