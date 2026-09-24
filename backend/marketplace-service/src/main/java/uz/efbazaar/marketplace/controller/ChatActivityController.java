package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.dto.ChatActivityResponse;
import uz.efbazaar.marketplace.dto.ChatTypingRequest;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ChatActivityService;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/chats")
@RequiredArgsConstructor
public class ChatActivityController {
    private final ChatActivityService activity;

    @PostMapping("/presence")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void presence(@AuthenticationPrincipal AuthenticatedUser user) {
        activity.presence(user.userId());
    }

    @GetMapping("/{id}/activity")
    public ChatActivityResponse get(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id) {
        return activity.activity(id, user.userId());
    }

    @PostMapping("/{id}/typing")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void typing(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id,
                       @Valid @RequestBody ChatTypingRequest request) {
        activity.typing(id, user.userId(), request.typing());
    }
}
