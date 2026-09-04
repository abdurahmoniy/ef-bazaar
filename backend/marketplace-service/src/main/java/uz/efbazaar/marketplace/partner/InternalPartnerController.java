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
    private final uz.efbazaar.marketplace.partner.ads.ChannelPostService channelPosts;
    private final uz.efbazaar.marketplace.partner.ads.PartnerChannelService partnerChannels;
    private final uz.efbazaar.marketplace.partner.ads.OfficialChannelService officialChannel;

    /**
     * Bot postni chiqardi yoki chiqara olmadi.
     *
     * <p>{@code telegramMessageId} bo'lsa — hamkorga to'lanadi;
     * {@code error} bo'lsa — sotuvchiga qaytariladi. Bot jim qolsa
     * sotuvchining puli ushlangan holda abadiy turardi, shuning uchun
     * ikkala yo'l ham shu yerdan o'tadi.
     */
    @PostMapping("/channel-post-result")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void channelPostResult(@Valid @RequestBody ChannelPostResultRequest request) {
        if (request.telegramMessageId() != null && !request.telegramMessageId().isBlank()) {
            channelPosts.onPosted(request.postId(), request.telegramMessageId());
        } else {
            channelPosts.onFailed(request.postId(),
                    request.error() == null ? "Bot postni chiqara olmadi" : request.error());
        }
    }

    public record ChannelPostResultRequest(
            @jakarta.validation.constraints.NotNull java.util.UUID postId,
            String telegramMessageId,
            String error) {}

    @PostMapping("/channel-verified")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void channelVerified(@Valid @RequestBody ChannelVerifiedRequest request) {
        service.onChannelVerified(request);
    }

    /**
     * Bot kanaldan chiqarib tashlandi — hamkorlik avtomatik to'xtaydi.
     *
     * <p>Bot u yerdan ketgach obunachi sonini ham, egalikni ham tekshirib
     * bo'lmaydi. Maqomni saqlab qolish "hamkor, lekin tekshirib bo'lmaydi"
     * degan ko'rinmas holatni yaratardi.
     */
    @PostMapping("/channel-removed")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void channelRemoved(@RequestBody ChannelRemovedRequest request) {
        service.onChannelRemoved(request.channelId());
    }

    public record ChannelRemovedRequest(Long channelId) {}

    /**
     * Kunlik yangilanishning natijasi.
     *
     * <p>MUVAFFAQIYATSIZLIK HAM shu yerdan o'tadi: bot jim qolsa,
     * botsiz kanal ro'yxatda abadiy qolib ketardi. {@code subscriberCount}
     * bo'sh bo'lsa — o'qilmadi degani.
     */
    /**
     * E'lon efBazaar rasmiy kanaliga chiqdi yoki chiqmadi.
     *
     * <p>Muvaffaqiyatsizlik ham yoziladi: bu post bepul, ya'ni uni
     * yo'qotish hech kimning pulini yo'qotmaydi — lekin sababsiz
     * yo'qolgan e'lonni hech kim sezmasdi.
     */
    @PostMapping("/official-post-result")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void officialPostResult(@Valid @RequestBody OfficialPostResultRequest request) {
        officialChannel.onOfficialPosted(
                request.listingId(), request.telegramMessageId(), request.error());
    }

    public record OfficialPostResultRequest(
            @jakarta.validation.constraints.NotNull java.util.UUID listingId,
            String telegramMessageId,
            String error) {}

    @PostMapping("/channel-refreshed")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void channelRefreshed(
            @Valid @RequestBody uz.efbazaar.marketplace.partner.ads
                    .PartnerChannelService.ChannelRefreshedRequest request) {
        partnerChannels.onChannelRefreshed(request);
    }
}
