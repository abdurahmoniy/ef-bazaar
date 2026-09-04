package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.PartnerAdDtos.ChannelCard;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.util.List;

/** E'lon berayotgan sotuvchi ko'radigan kanallar ro'yxati. */
@Service
@RequiredArgsConstructor
public class ChannelDirectoryService {

    private final PartnerChannelRepository channels;
    private final PartnerPricing pricing;

    /**
     * @param query bo'sh bo'lsa — obunachi bo'yicha reyting; yozilgan
     *              bo'lsa nom boshlanishi bo'yicha, ichida yana
     *              obunachi bo'yicha.
     *
     * <p>Tartib BAZADAN keladi, bu yerda qayta saralanmaydi: ikki joyda
     * ikki xil tartib bo'lsa ular vaqt o'tib bir-biridan uzoqlashadi.
     */
    @Transactional(readOnly = true)
    public List<ChannelCard> search(String query) {
        String prefix = query == null ? "" : query.trim();

        List<PartnerChannel> found = prefix.isEmpty()
                ? channels.findByActiveTrueOrderBySubscriberCountDesc()
                : channels.findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc(
                        prefix.toUpperCase());

        return found.stream().map(this::card).toList();
    }

    private ChannelCard card(PartnerChannel channel) {
        return new ChannelCard(
                channel.getId(),
                channel.getTitle(),
                channel.getUsername(),
                // file_id o'zi beriladi: frontend uni /bot/photo/... ga
                // aylantiradi, e'lon rasmlari bilan bir xil yo'ldan.
                channel.getPhotoFileId(),
                channel.getSubscriberCount(),
                // priceFor, getPostPriceSom emas — tariflar shu yerdan
                // qo'shiladi va bu chaqiruv o'zgarmaydi. E'lon hali
                // tanlanmagan, shuning uchun null.
                pricing.priceFor(channel, null));
    }
}
