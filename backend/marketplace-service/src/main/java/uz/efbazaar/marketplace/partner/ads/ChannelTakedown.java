package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.time.Instant;
import java.util.Optional;

/**
 * Olib tashlangan e'lonni kanallardan ham olib tashlaydi.
 *
 * <p>Muammo: e'lon efBazaar'dan o'chirilardi, kanallardagi nusxalari esa
 * tugmasi bilan tirik qolardi. Aynan olib tashlanayotgan narsa reklama
 * qilinishda davom etardi, va tugma mavjud bo'lmagan e'longa olib
 * borardi. Noto'g'ri yoki zararli kontent uchun bu eng yomon natija.
 *
 * <p><b>Nega sotilganidan boshqacha.</b> {@link SoldPostMarker} postni
 * qoldirib, ustidan chizadi: sotilgan e'lon haqiqiy edi va kanal
 * tarixida qolishi o'rinli. Olib tashlangan e'lon esa umuman
 * ko'rinmasligi kerak.
 *
 * <p>Qator o'chirilmaydi — u to'langan va hamkor undan daromad olgan.
 * {@code removedAt} faqat "bu qatordagi xabar endi kanalda yo'q, va
 * qaytarilishi mumkin" deb belgilaydi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChannelTakedown {

    private final ListingChannelPostRepository posts;
    private final PartnerChannelRepository channels;
    private final OfficialChannelService official;
    private final ChannelPostService channelPosts;
    private final PartnerAdEventPublisher events;

    /** E'lon olib tashlandi: hamkor kanallaridagi va rasmiy kanaldagi nusxalar ketadi. */
    @Transactional
    public void onRemoved(Listing listing) {
        int removed = 0;
        for (ListingChannelPost post : posts.findByListingId(listing.getId())) {
            // Faqat TIRIK postlar. Almashtirilgani kanalda allaqachon yo'q,
            // olib tashlangani esa ikkinchi marta o'chirilmaydi.
            if (!State.POSTED.name().equals(post.getState())) continue;
            if (post.getReplacedAt() != null || post.getRemovedAt() != null) continue;
            if (post.getTelegramMessageId() == null || post.getTelegramMessageId().isBlank()) continue;

            Optional<PartnerChannel> channel = channels.findById(post.getPartnerChannelId());
            if (channel.isEmpty()) continue;

            events.postDeleteRequested(post, channel.get());
            // Belgilash o'chirish TOPSHIRIG'I bilan birga, uning natijasini
            // kutmasdan: bot o'chira olmasligi mumkin (huquq yo'q, xabar
            // qo'lda o'chirilgan) va u holatni qaytarmaydi. Tiklashda qayta
            // chiqarish o'chirilmagan xabarning ustiga ikkinchisini qo'yadi,
            // bu esa o'chmagan xabarni abadiy tirik qoldirishdan yaxshiroq.
            post.setRemovedAt(Instant.now());
            posts.save(post);
            removed++;
        }

        official.onListingRemoved(listing.getId());
        if (removed > 0) {
            log.info("E'lon {} olib tashlandi: {} ta hamkor postidan o'chirish so'raldi",
                    listing.getId(), removed);
        }
    }

    /**
     * E'lon tiklandi: olib tashlangan nusxalar kanallarga qaytariladi.
     *
     * <p>Telegram o'chirilgan xabarni tiklamaydi, ya'ni bu yangi postlar
     * va yangi identifikatorlar. Obunachi e'lonni ikkinchi marta ko'radi
     * — bu tiklashning narxi va uni yashirishning yo'li yo'q.
     */
    @Transactional
    public void onRestored(Listing listing) {
        channelPosts.republishRemoved(listing.getId());
        official.onListingRestored(listing);
    }
}
