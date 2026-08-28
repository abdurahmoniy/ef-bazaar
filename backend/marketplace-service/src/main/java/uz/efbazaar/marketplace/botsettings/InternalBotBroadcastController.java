package uz.efbazaar.marketplace.botsettings;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.botsettings.BotBroadcastDtos.BroadcastProgressRequest;
import uz.efbazaar.marketplace.botsettings.BotBroadcastDtos.BroadcastResponse;

import java.util.UUID;

/**
 * Bot jo'natish borishini shu yerga xabar qiladi.
 *
 * <p>{@code X-Internal-Secret} bilan himoyalangan va nginx {@code /internal/}
 * prefiksini tashqaridan bloklaydi.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/bot-broadcasts")
@RequiredArgsConstructor
public class InternalBotBroadcastController {

    private final BotBroadcastService service;

    @PatchMapping("/{id}/progress")
    public BroadcastResponse progress(@PathVariable UUID id,
                                      @Valid @RequestBody BroadcastProgressRequest body) {
        return BroadcastResponse.from(service.applyProgress(id, body));
    }
}
