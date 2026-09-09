package uz.efbazaar.marketplace.support.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.support.domain.SupportCategory;
import uz.efbazaar.marketplace.support.domain.SupportChatStatus;
import uz.efbazaar.marketplace.support.dto.AdminSupportChatSummaryResponse;
import uz.efbazaar.marketplace.support.dto.AdminSupportReplyRequest;
import uz.efbazaar.marketplace.support.dto.SupportChatResponse;
import uz.efbazaar.marketplace.support.dto.SupportMessageResponse;
import uz.efbazaar.marketplace.support.service.SupportChatService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/support")
@RequiredArgsConstructor
public class AdminSupportController {

    private final SupportChatService supportChatService;

    @GetMapping("/chats")
    public PageResponse<AdminSupportChatSummaryResponse> list(
            @RequestParam(required = false) SupportCategory category,
            @RequestParam(required = false) SupportChatStatus status,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "lastMessageAt", direction = Sort.Direction.DESC) Pageable pageable
    ) {
        Page<AdminSupportChatSummaryResponse> page = supportChatService.getChatsForAdmin(category, status, search, pageable);
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }

    @GetMapping("/chats/{chatId}")
    public SupportChatResponse getChat(@PathVariable UUID chatId) {
        return supportChatService.getChatForAdmin(chatId);
    }

    @PostMapping("/chats/{chatId}/reply")
    @ResponseStatus(HttpStatus.CREATED)
    public SupportMessageResponse reply(
            @AuthenticationPrincipal AuthenticatedUser adminUser,
            @PathVariable UUID chatId,
            @Valid @RequestBody AdminSupportReplyRequest request
    ) {
        return supportChatService.replyAsAdmin(chatId, adminUser, request);
    }

    @PostMapping("/chats/{chatId}/close")
    public SupportChatResponse closeChat(@PathVariable UUID chatId) {
        return supportChatService.closeChatAsAdmin(chatId);
    }
}
