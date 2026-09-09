package uz.efbazaar.marketplace.partner.ads;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.OfficialChannelPostRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Har bir e'lonning efBazaar rasmiy kanalidagi nusxasi.
 *
 * <p>Nusxa HAR DOIM to'g'ridan-to'g'ri joylanadi.
 *
 * <p>NEGA FORWARD EMAS. Ilgari hamkor kanali tanlangan bo'lsa nusxa
 * o'sha postdan forward qilinardi: "Forwarded from &lt;hamkor
 * kanali&gt;" sarlavhasi efBazaar e'lonni tortib olmayotganini, balki
 * hamkorligini tasdiqlayotganini ko'rsatardi.
 *
 * <p>Lekin forward qilingan xabarni TAHRIRLAB BO'LMAYDI. Ya'ni
 * sotilgan e'lon rasmiy kanalda sotuvda turaverardi — xaridor uchun
 * yolg'on ma'lumot. Va u jimgina turardi: {@code SoldPostMarker} tahrir
 * so'rovini yuborardi, Telegram rad etardi, bot esa buni INFO bilan
 * yozib o'tib ketardi.
 *
 * <p>Hamkorlik belgisi shunga arzimadi. Havola post MATNIDA turgani
 * uchun e'longa yo'l baribir ochiq.
 */
@Slf4j
@Service
public class OfficialChannelService {

    private final ListingRepository listings;
    private final OfficialChannelPostRepository official;
    private final ListingChannelPostRepository posts;
    private final PartnerAdEventPublisher events;
    private final String webBaseUrl;

    /**
     * Rasmiy kanal manzili — {@code @EfBazaar} yoki raqamli id.
     *
     * <p>BO'SH BO'LSA butunlay o'chiq. Sozlanmagan muhit na yiqilishi,
     * na noto'g'ri joyga post qilishi kerak — staging jonli kanalga
     * yozib yuborsa, buni orqaga qaytarib bo'lmaydi.
     */
    private final String officialChannel;

    public OfficialChannelService(ListingRepository listings,
                                  OfficialChannelPostRepository official,
                                  ListingChannelPostRepository posts,
                                  PartnerAdEventPublisher events,
                                  @Value("${app.web.base-url:https://efbazaar.uz}") String webBaseUrl,
                                  @Value("${app.channels.official:}") String officialChannel) {
        this.listings = listings;
        this.official = official;
        this.posts = posts;
        this.events = events;
        this.webBaseUrl = webBaseUrl;
        this.officialChannel = officialChannel == null ? "" : officialChannel.trim();
    }

    public boolean enabled() {
        return !officialChannel.isEmpty();
    }

    /**
     * E'lon yaratildi — rasmiy nusxa darrov joylanadi.
     *
     * <p>Hamkor kanali tanlangan-tanlanmagani ahamiyatsiz: ilgari
     * tanlangan bo'lsa hamkor posti kutilardi va undan forward
     * qilinardi. Endi kutilmaydi, chunki forward tahrirlanmaydi va
     * SOTILDI belgisi ishlamay qolardi.
     */
    @Transactional
    public void onListingCreated(Listing listing) {
        if (!enabled() || official.existsById(listing.getId())) return;

        OfficialChannelPost row = new OfficialChannelPost();
        row.setListingId(listing.getId());
        official.save(row);
        publishDirect(listing, row);
    }

    @Transactional
    public void onOfficialPosted(UUID listingId, String telegramMessageId, String error) {
        official.findById(listingId).ifPresent(row -> {
            if (telegramMessageId != null && !telegramMessageId.isBlank()) {
                row.setState(OfficialChannelPost.State.POSTED.name());
                row.setTelegramMessageId(telegramMessageId);
                row.setPostedAt(java.time.Instant.now());
            } else {
                // Qayta urinilmaydi: rasmiy nusxa bepul va uni
                // yo'qotish hech kimning pulini yo'qotmaydi. Sababni
                // saqlaymiz, chunki jimgina yo'qolgan post umuman
                // sezilmasdi.
                row.setState(OfficialChannelPost.State.FAILED.name());
                row.setError(error == null ? "Noma'lum xato" : error);
                log.warn("E'lon {} rasmiy kanalga tushmadi: {}", listingId, row.getError());
            }
            official.save(row);
        });
    }

    /** Rasmiy kanaldagi tirik nusxalar — sotilganda tahrirlanadi. */
    @Transactional(readOnly = true)
    public Optional<OfficialChannelPost> deliveredFor(UUID listingId) {
        return official.findById(listingId)
                .filter(row -> OfficialChannelPost.State.POSTED.name().equals(row.getState()));
    }

    private void publishDirect(Listing listing, OfficialChannelPost row) {
        // Rasmiy kanalda hamkor kodi YO'Q: bu post hech qaysi hamkorga
        // tegishli emas va undan kelgan savdo ulushi ham yo'q.
        String url = webBaseUrl + "/marketplace/" + listing.getId();
        List<String> media = listing.getMediaMessageIds();
        events.officialPostRequested(new PartnerAdEventPublisher.OfficialPostPayload(
                listing.getId(), officialChannel,
                ChannelPostCaption.of(listing, url),
                media == null || media.isEmpty() ? null : media.get(0),
                url, null, null));
    }
}
