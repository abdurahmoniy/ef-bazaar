package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingPartnerAttributionRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerClickRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Qaysi kanal xaridorni shu e'longa olib kelgani.
 *
 * <p>SAVDO ULUSHI SHU YERDAN HISOBLANADI. Har kanal posti o'z kodini
 * olib yuradi, shuning uchun bosish qaysi kanaldan kelganini bir
 * qiymatli ko'rsatadi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ListingAttributionService {

    /** Savdo ochilganda muhrlanadigan juftlik. */
    public record Attribution(UUID partnerChannelId, UUID partnerUserId, int percentBp) {}

    private final PartnerChannelRepository channels;
    private final PartnerClickRepository clicks;
    private final ListingPartnerAttributionRepository attributions;
    private final PartnerPayoutPolicy policy;

    /**
     * Bosishni yozadi va — kirgan foydalanuvchi bo'lsa — e'lonni shu
     * kanalga biriktiradi.
     *
     * <p>ANONIM BOSISH HAM YOZILADI. Uni tashlab yuborish dasturning
     * butun maqsadini yo'qotadi: hali ro'yxatdan o'tmagan odam aynan
     * kanal olib kelgan odam.
     *
     * <p>Yopilgan kanalning eski postidan kelgan bosish ham sanaladi —
     * odam haqiqatan o'sha kanaldan kelgan; qidiruvda ko'rinmasligi
     * boshqa masala.
     */
    @Transactional
    public void recordClick(String linkCode, UUID listingId, UUID userId) {
        Optional<PartnerChannel> channel = channels.findByLinkCode(
                linkCode == null ? "" : linkCode.trim().toUpperCase());
        if (channel.isEmpty()) return;

        UUID channelId = channel.get().getId();
        clicks.save(new PartnerClick(channelId,
                listingId == null ? PartnerClick.Kind.REFERRAL : PartnerClick.Kind.LISTING,
                listingId, userId));

        if (listingId == null || userId == null) return;

        // OXIRGI BOSISH G'OLIB. Mavjud qator bo'lsa ustiga yozamiz —
        // ulush savdoni haqiqatan keltirgan kanalga tegishli.
        ListingPartnerAttribution attribution = attributions
                .findById(new ListingPartnerAttribution.Key(listingId, userId))
                .orElseGet(() -> new ListingPartnerAttribution(listingId, userId, channelId));
        attribution.setPartnerChannelId(channelId);
        attribution.setUpdatedAt(Instant.now());
        attributions.save(attribution);
    }

    /**
     * Savdo ochilayotganda: shu xaridor shu e'longa qaysi kanaldan
     * kelgan va unga qanday stavka qo'llanadi.
     */
    @Transactional(readOnly = true)
    public Optional<Attribution> attributionFor(UUID listingId, UUID buyerId) {
        if (listingId == null || buyerId == null) return Optional.empty();

        return attributions.findById(new ListingPartnerAttribution.Key(listingId, buyerId))
                .flatMap(a -> channels.findById(a.getPartnerChannelId()))
                .map(channel -> new Attribution(
                        channel.getId(),
                        channel.getPartnerUserId(),
                        policy.resolve(channel).tradePercentBp()));
    }
}
