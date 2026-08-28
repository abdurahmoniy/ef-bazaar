package uz.efbazaar.marketplace.partner;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.partner.PartnerDtos.ChannelVerifiedRequest;

/**
 * Bot kanal tekshiruvi natijasini shu yerga yuboradi.
 *
 * <p>{@code X-Internal-Secret} bilan himoyalangan va nginx {@code /internal/}
 * prefiksini tashqaridan bloklaydi — aks holda istalgan odam o'ziga
 * "1 000 000 obunachili kanal" tekshiruvini yuborib qo'ya olardi.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/partners")
@RequiredArgsConstructor
public class InternalPartnerController {

    private final PartnerService service;

    @PostMapping("/channel-verified")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void channelVerified(@Valid @RequestBody ChannelVerifiedRequest request) {
        service.onChannelVerified(request);
    }
}
