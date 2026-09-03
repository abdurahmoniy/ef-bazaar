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
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.PartnerPanelResponse;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.PostRow;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerClickRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;

import java.math.BigDecimal;
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

    @Transactional(readOnly = true)
    public PartnerPanelResponse panelFor(UUID partnerUserId) {
        PartnerChannel channel = requireChannel(partnerUserId);

        List<ListingChannelPost> channelPosts =
                posts.findByPartnerChannelIdOrderByCreatedAtDesc(channel.getId());

        return new PartnerPanelResponse(
                new ChannelSummary(channel.getId(), channel.getTitle(), channel.getUsername(),
                        channel.getSubscriberCount(), channel.getPostPriceSom()),
                new ChannelFunnel(
                        clicks.countByPartnerChannelId(channel.getId()),
                        // KANAL bo'yicha, hamkor bo'yicha emas: uning shaxsiy
                        // taklif havolasidan kelganlar bu voronkaga kirmaydi.
                        referrals.countByPartnerChannelId(channel.getId())),
                earnings(channelPosts),
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
     * Uch oqim ALOHIDA hisoblanadi.
     *
     * <p>Post haqi shu yerdagi qatorlardan yig'iladi; savdo ulushi va
     * oylik to'lov esa hamyon tarixidan keladi va bu bosqichda nol
     * qaytadi — panel ularni ko'rsatadi, lekin manba keyingi qadamda
     * ulanadi.
     */
    private Earnings earnings(List<ListingChannelPost> channelPosts) {
        BigDecimal fromPosts = channelPosts.stream()
                .filter(p -> State.POSTED.name().equals(p.getState()))
                .map(ListingChannelPost::getPriceSom)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new Earnings(fromPosts, BigDecimal.ZERO, BigDecimal.ZERO);
    }

    private static PostRow row(ListingChannelPost p) {
        return new PostRow(p.getId(), p.getListingId(), p.getState(),
                p.getPriceSom(), p.getCreatedAt(), p.getPostedAt());
    }

    private PartnerChannel requireChannel(UUID partnerUserId) {
        return channels.findByPartnerUserIdAndActiveTrue(partnerUserId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Faol hamkor kanali topilmadi"));
    }

}
