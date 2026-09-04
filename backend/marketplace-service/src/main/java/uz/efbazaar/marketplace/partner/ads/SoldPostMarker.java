package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdEventPublisher.PostEditPayload;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.OfficialChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.util.Optional;

/**
 * Sotilgan e'lonni kanallarda ham sotilgan deb belgilaydi.
 *
 * <p>Post kanalda qolaveradi — uni o'chirish kanal tarixini yeb
 * qo'yardi va hamkor to'lov olgan reklamasini yo'qotardi. O'rniga
 * matn ustidan chiziladi, boshiga SOTILDI qo'yiladi va TUGMA OLIB
 * TASHLANADI: ustidan chizilgan matnni o'qimagan odam ham tugmani
 * bosib, mavjud bo'lmagan taklifga borardi.
 */
@Slf4j
@Service
public class SoldPostMarker {

    private final ListingChannelPostRepository posts;
    private final PartnerChannelRepository channels;
    private final OfficialChannelPostRepository official;
    private final PartnerAdEventPublisher events;
    private final String webBaseUrl;
    private final String officialChannel;

    public SoldPostMarker(ListingChannelPostRepository posts,
                          PartnerChannelRepository channels,
                          OfficialChannelPostRepository official,
                          PartnerAdEventPublisher events,
                          @Value("${app.web.base-url:https://efbazaar.uz}") String webBaseUrl,
                          @Value("${app.channels.official:}") String officialChannel) {
        this.posts = posts;
        this.channels = channels;
        this.official = official;
        this.events = events;
        this.webBaseUrl = webBaseUrl;
        this.officialChannel = officialChannel == null ? "" : officialChannel.trim();
    }

    @Transactional
    public void onSold(Listing listing) {
        for (ListingChannelPost post : posts.findByListingId(listing.getId())) {
            // Faqat TIRIK postlar: almashtirilgani kanaldan allaqachon
            // o'chirilgan va uni tahrirlash Telegram xatosini beradi.
            if (!State.POSTED.name().equals(post.getState())) continue;
            if (post.getReplacedAt() != null) continue;
            if (post.getTelegramMessageId() == null || post.getTelegramMessageId().isBlank()) continue;

            Optional<PartnerChannel> channel = channels.findById(post.getPartnerChannelId());
            if (channel.isEmpty()) continue;

            String url = webBaseUrl + "/marketplace/" + listing.getId()
                    + "?p=" + channel.get().getLinkCode();
            events.postEditRequested(new PostEditPayload(
                    String.valueOf(channel.get().getTelegramChannelId()),
                    post.getTelegramMessageId(),
                    ChannelPostCaption.sold(ChannelPostCaption.of(listing, url))));
        }

        if (officialChannel.isEmpty()) return;
        official.findById(listing.getId())
                .filter(row -> OfficialChannelPost.State.POSTED.name().equals(row.getState()))
                .filter(row -> row.getTelegramMessageId() != null)
                .ifPresent(row -> {
                    // Rasmiy nusxada hamkor kodi yo'q — u hech qaysi
                    // hamkorga tegishli emas.
                    String url = webBaseUrl + "/marketplace/" + listing.getId();
                    events.postEditRequested(new PostEditPayload(
                            officialChannel, row.getTelegramMessageId(),
                            ChannelPostCaption.sold(ChannelPostCaption.of(listing, url))));
                });
    }
}
