package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.PartnerFunnelRow;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerClickRepository;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralRepository;

import java.math.BigDecimal;
import java.util.List;

/**
 * Adminka: qaysi kanal nima keltirayapti.
 *
 * <p>YOPILGAN KANALLAR HAM KO'RSATILADI. Ular keltirgan pul va odam
 * yo'qolmaydi, va hamkorlik nega to'xtaganini baholash uchun aynan
 * o'sha raqamlar kerak.
 */
@Service
@RequiredArgsConstructor
public class PartnerAnalyticsService {

    private final PartnerChannelRepository channels;
    private final PartnerClickRepository clicks;
    private final ReferralRepository referrals;
    private final ListingChannelPostRepository posts;

    @Transactional(readOnly = true)
    public List<PartnerFunnelRow> funnel() {
        return channels.findAll().stream().map(this::row).toList();
    }

    private PartnerFunnelRow row(PartnerChannel channel) {
        List<ListingChannelPost> channelPosts =
                posts.findByPartnerChannelIdOrderByCreatedAtDesc(channel.getId());

        long delivered = channelPosts.stream()
                .filter(p -> State.POSTED.name().equals(p.getState())).count();
        long refunded = channelPosts.stream()
                .filter(p -> State.REFUNDED.name().equals(p.getState())).count();

        // Faqat CHIQQAN post daromad: ushlangan pul hali sotuvchiniki,
        // qaytarilgani esa umuman daromad emas.
        BigDecimal revenue = channelPosts.stream()
                .filter(p -> State.POSTED.name().equals(p.getState()))
                .map(ListingChannelPost::getPriceSom)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new PartnerFunnelRow(
                channel.getId(),
                channel.getTitle(),
                channel.getSubscriberCount(),
                channel.isActive(),
                clicks.countByPartnerChannelId(channel.getId()),
                // KANAL bo'yicha, egasi bo'yicha emas — hamkorning
                // shaxsiy taklif havolasi bu voronkaga kirmaydi.
                referrals.countByPartnerChannelId(channel.getId()),
                channelPosts.size(),
                delivered,
                refunded,
                revenue);
    }
}
