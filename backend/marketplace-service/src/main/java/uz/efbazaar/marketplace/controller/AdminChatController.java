package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.dto.AdminChatResponse;
import uz.efbazaar.marketplace.dto.MessageResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.AdminChatService;

import java.util.UUID;

/**
 * Buyer–seller chats, read-only, for admins. GET only — there is deliberately
 * no way to send, edit, delete or mark anything read from here.
 * Gated by {@code ROLE_ADMIN} in {@link uz.efbazaar.marketplace.config.SecurityConfig}.
 */
@RestController
@RequestMapping("/api/v1/admin/chats")
@RequiredArgsConstructor
public class AdminChatController {

    private final AdminChatService service;

    @GetMapping
    public PageResponse<AdminChatResponse> list(@RequestParam(required = false) String q,
                                                @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        return service.list(q, page, size);
    }

    @GetMapping("/{id}")
    public AdminChatResponse get(@AuthenticationPrincipal AuthenticatedUser admin,
                                 @PathVariable UUID id) {
        return service.get(admin.userId(), id);
    }

    @GetMapping("/{id}/messages")
    public PageResponse<MessageResponse> messages(@PathVariable UUID id,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "100") int size) {
        return service.messages(id, page, size);
    }
}
