package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.ChannelFunnel;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.ChannelSummary;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.Earnings;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.PayoutTerms;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.PartnerPanelResponse;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.PostRow;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerClickRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

/** Hamkorning o'z paneli. */
@Service
@RequiredArgsConstructor
public class PartnerPanelService {

    private final PartnerChannelRepository channels;
    private final ListingChannelPostRepository posts;
    private final PartnerClickRepository clicks;
    private final ReferralRepository referrals;
    private final PartnerAdClient payments;
    private final PartnerPayoutPolicy policy;

    @Transactional(readOnly = true)
    public PartnerPanelResponse panelFor(UUID partnerUserId) {
        PartnerChannel channel = requireChannel(partnerUserId);

        List<ListingChannelPost> channelPosts =
                posts.findByPartnerChannelIdOrderByCreatedAtDesc(channel.getId());

        return new PartnerPanelResponse(
                new ChannelSummary(channel.getId(), channel.getTitle(), channel.getUsername(),
                        channel.getPhotoFileId(),
                        channel.getSubscriberCount(), channel.getPostPriceSom()),
                postSettingsOf(channel),
                terms(channel),
                new ChannelFunnel(
                        clicks.countByPartnerChannelId(channel.getId()),
                        // KANAL bo'yicha, hamkor bo'yicha emas: uning shaxsiy
                        // taklif havolasidan kelganlar bu voronkaga kirmaydi.
                        referrals.countByPartnerChannelId(channel.getId())),
                earnings(partnerUserId),
                channelPosts.stream().map(PartnerPanelService::row).toList());
    }

    /**
     * Post narxini o'zgartiradi.
     *
     * <p>Yuqori chegara YO'Q — narx hamkorning o'z ishi. Qimmat kanal
     * shunchaki tanlanmaydi, va bu bozorning o'zi hal qiladigan narsa.
     *
     * <p>Manfiy narx esa narx emas: u sotuvchiga pul to'lash bo'lardi.
     */
    @Transactional
    public PartnerChannel updatePostPrice(UUID partnerUserId, BigDecimal priceSom) {
        if (priceSom == null || priceSom.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Narx manfiy bo'lishi mumkin emas");
        }
        PartnerChannel channel = requireChannel(partnerUserId);
        channel.setPostPriceSom(priceSom);
        return channels.save(channel);
    }

    /**
     * Uch oqim — ledger'dan, marketplace nusxasidan emas.
     *
     * <p>Bitta to'lovning ikkita yozuvi vaqt o'tib bir-biridan
     * uzoqlashadi va keyin qaysi biri to'g'ri ekani bilinmaydi.
     * "E'lon joylashdan" ni ham shu yerdan olamiz, garchi
     * {@code listing_channel_posts} dan ham hisoblash mumkin bo'lsa
     * ham: uchala raqam bitta manbadan kelgani yaxshiroq.
     */
    private Earnings earnings(UUID partnerUserId) {
        var paid = payments.earnings(partnerUserId);
        return new Earnings(paid.fromPostsSom(), paid.fromTradesSom(), paid.monthlySom());
    }

    /**
     * Amaldagi shart — hamkor uni faqat KO'RADI, o'zgartira olmaydi.
     *
     * <p>Foiz asos punktida saqlanadi (1000 = 10%), lekin ekranga
     * foizda chiqadi: hamkorga "1000 asos punkti" hech narsa
     * demaydi.
     */
    private PayoutTerms terms(PartnerChannel channel) {
        var payout = policy.resolve(channel);
        return new PayoutTerms(
                payout.mode().name(),
                BigDecimal.valueOf(payout.tradePercentBp()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP),
                payout.fixedMonthlySom());
    }

    private static PostRow row(ListingChannelPost p) {
        return new PostRow(p.getId(), p.getListingId(), p.getState(),
                p.getPriceSom(), p.getCreatedAt(), p.getPostedAt());
    }

    /**
     * Hamkor o'z postining ko'rinishini o'zgartiradi.
     *
     * <p>Bloklar ro'yxati TARTIB ham, yoqilganlik ham: ro'yxatda bor
     * blok chiqadi, yo'qi chiqmaydi. Noma'lum kalitlar
     * {@link ChannelPostLayout#parse} da tashlanadi, ya'ni eski
     * klient yuborgan nom butun sozlamani yiqitmaydi.
     */
    @Transactional
    public PartnerPanelResponse updatePostSettings(UUID partnerUserId,
                                                   List<String> blocks, String footer) {
        PartnerChannel channel = requireChannel(partnerUserId);
        ChannelPostLayout layout = ChannelPostLayout.parse(blocks);
        channel.setPostBlocks(layout.keys().toArray(String[]::new));

        String trimmed = footer == null ? null : footer.strip();
        if (trimmed != null && trimmed.isEmpty()) trimmed = null;
        if (trimmed != null && trimmed.length() > ChannelPostCaption.FOOTER_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Footer " + ChannelPostCaption.FOOTER_LIMIT + " belgidan oshmasligi kerak");
        }
        channel.setPostFooter(trimmed);
        channels.save(channel);
        return panelFor(partnerUserId);
    }

    private PartnerAdDtos.PostSettings postSettingsOf(PartnerChannel channel) {
        ChannelPostLayout layout = ChannelPostLayout.parse(
                channel.getPostBlocks() == null ? null : List.of(channel.getPostBlocks()));
        return new PartnerAdDtos.PostSettings(
                layout.keys(),
                layout.disabled().stream().map(Enum::name).toList(),
                channel.getPostFooter(),
                ChannelPostCaption.FOOTER_LIMIT);
    }

    private PartnerChannel requireChannel(UUID partnerUserId) {
        return channels.findByPartnerUserIdAndActiveTrue(partnerUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Faol hamkor kanali topilmadi"));
    }

}
