package uz.efbazaar.marketplace.support.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.support.dto.CreateSupportChatRequest;
import uz.efbazaar.marketplace.support.dto.SendSupportMessageRequest;
import uz.efbazaar.marketplace.support.dto.SupportChatResponse;
import uz.efbazaar.marketplace.support.dto.SupportMessageResponse;
import uz.efbazaar.marketplace.support.service.SupportChatService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/support")
@RequiredArgsConstructor
public class SupportController {

    private final SupportChatService supportChatService;

    @PostMapping("/chats")
    @ResponseStatus(HttpStatus.CREATED)
    public SupportChatResponse createChat(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestHeader(value = "X-Guest-Session-Id", required = false) String headerGuestSessionId,
            @Valid @RequestBody CreateSupportChatRequest request
    ) {
        String guestSessionId = StringUtils.hasText(request.guestSessionId())
                ? request.guestSessionId()
                : headerGuestSessionId;

        CreateSupportChatRequest resolvedRequest = new CreateSupportChatRequest(
                request.category(),
                request.message(),
                request.senderName(),
                request.senderContact(),
                guestSessionId
        );

        return supportChatService.createChat(user, resolvedRequest);
    }

    @PostMapping("/chats/{chatId}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public SupportMessageResponse sendMessage(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID chatId,
            @RequestHeader(value = "X-Guest-Session-Id", required = false) String headerGuestSessionId,
            @Valid @RequestBody SendSupportMessageRequest request
    ) {
        String guestSessionId = StringUtils.hasText(request.guestSessionId())
                ? request.guestSessionId()
                : headerGuestSessionId;

        SendSupportMessageRequest resolvedRequest = new SendSupportMessageRequest(
                request.content(),
                guestSessionId
        );

        return supportChatService.sendMessage(chatId, user, resolvedRequest);
    }

    @GetMapping("/chats/{chatId}")
    public SupportChatResponse getChat(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID chatId,
            @RequestParam(value = "guestSessionId", required = false) String queryGuestSessionId,
            @RequestHeader(value = "X-Guest-Session-Id", required = false) String headerGuestSessionId
    ) {
        String guestSessionId = StringUtils.hasText(queryGuestSessionId) ? queryGuestSessionId : headerGuestSessionId;
        return supportChatService.getChat(chatId, user, guestSessionId);
    }

    @GetMapping("/chats/active")
    public ResponseEntity<SupportChatResponse> getActiveChat(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(value = "guestSessionId", required = false) String queryGuestSessionId,
            @RequestHeader(value = "X-Guest-Session-Id", required = false) String headerGuestSessionId
    ) {
        String guestSessionId = StringUtils.hasText(queryGuestSessionId) ? queryGuestSessionId : headerGuestSessionId;
        return supportChatService.getActiveChat(user, guestSessionId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/chats/{chatId}/close")
    public SupportChatResponse closeChat(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable UUID chatId,
            @RequestParam(value = "guestSessionId", required = false) String queryGuestSessionId,
            @RequestHeader(value = "X-Guest-Session-Id", required = false) String headerGuestSessionId
    ) {
        String guestSessionId = StringUtils.hasText(queryGuestSessionId) ? queryGuestSessionId : headerGuestSessionId;
        return supportChatService.closeChat(chatId, user, guestSessionId);
    }
}
