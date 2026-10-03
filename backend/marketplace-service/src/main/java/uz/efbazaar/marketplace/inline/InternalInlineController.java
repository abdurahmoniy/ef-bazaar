package uz.efbazaar.marketplace.inline;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Telegram inline mode for the bot (`@EfBazaarBot` in any chat). Behind
 * {@link uz.efbazaar.marketplace.security.InternalSecretFilter} like every
 * /internal/** path; the bot passes the Telegram id Telegram attached to the
 * inline query.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/inline")
@RequiredArgsConstructor
public class InternalInlineController {

    private final InlineListingService service;

    @GetMapping("/listings")
    public InlineListingService.InlinePage listings(@RequestParam long telegramId,
                                                    @RequestParam(required = false) String q,
                                                    @RequestParam(required = false) Integer offset) {
        return service.find(telegramId, q == null ? "" : q, offset == null ? 0 : offset);
    }
}
