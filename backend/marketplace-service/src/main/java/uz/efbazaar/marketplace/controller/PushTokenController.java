package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.push.PushProperties;
import uz.efbazaar.marketplace.repository.PushTokenRepository;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class PushTokenController {
    private final PushTokenRepository tokens;
    private final PushProperties properties;

    public record TokenRequest(@NotBlank @Size(max = 2048) @Pattern(regexp = "[A-Za-z0-9_:\u002d]+") String token) {}

    @GetMapping("/push-status")
    public Map<String, Boolean> status() { return Map.of("enabled", properties.isEnabled()); }

    @PutMapping("/push-tokens") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void register(@AuthenticationPrincipal AuthenticatedUser user, @Valid @RequestBody TokenRequest request) {
        tokens.register(user.userId(), request.token());
    }

    @DeleteMapping("/push-tokens") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal AuthenticatedUser user, @Valid @RequestBody TokenRequest request) {
        tokens.remove(user.userId(), request.token());
    }
}
