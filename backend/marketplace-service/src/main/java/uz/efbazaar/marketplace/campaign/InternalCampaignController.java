package uz.efbazaar.marketplace.campaign;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.campaign.CampaignDtos.BotStartRequest;

/**
 * Bot chaqiradi: {@code /start c_<kod>} yuki. {@code X-Internal-Secret} bilan
 * himoyalangan, nginx {@code /internal/} yo'lini tashqaridan to'sadi.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/campaigns")
@RequiredArgsConstructor
public class InternalCampaignController {

    private final CampaignService service;

    @PostMapping("/bot-start")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void botStart(@Valid @RequestBody BotStartRequest request) {
        service.rememberBotStart(request.telegramId(), request.code());
    }
}
