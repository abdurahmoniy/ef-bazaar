package uz.efbazaar.marketplace.channel;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

public final class ChannelMemberControllers {

    private ChannelMemberControllers() {}

    public record EventRequest(
            @NotNull Long channelId,
            String channelUsername,
            @NotNull Long telegramId,
            @NotBlank String kind,
            @NotNull Long occurredAt) {}

    /** Bot chaqiradi ({@code X-Internal-Secret}); nginx /internal/ ni tashqaridan to'sadi. */
    @RestController
    @RequiredArgsConstructor
    public static class Internal {
        private final ChannelMemberService service;

        @PostMapping("/internal/marketplace/v1/channel-members/events")
        @ResponseStatus(HttpStatus.NO_CONTENT)
        public void event(@Valid @RequestBody EventRequest e) {
            service.record(e.channelId(), e.channelUsername(), e.telegramId(), e.kind(), e.occurredAt());
        }
    }

    /** Adminka "O'sish" sahifasi — /api/v1/admin/** SecurityConfig'da ROLE_ADMIN. */
    @RestController
    @Validated
    @RequiredArgsConstructor
    public static class Admin {
        private final ChannelMemberService service;

        @GetMapping("/api/v1/admin/channel-members/summary")
        public ChannelMemberService.Summary summary(
                @RequestParam(defaultValue = "30") @jakarta.validation.constraints.Min(1)
                @jakarta.validation.constraints.Max(180) int days) {
            return service.summary(days);
        }
    }
}
