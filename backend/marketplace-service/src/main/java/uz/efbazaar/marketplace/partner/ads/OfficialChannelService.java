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
 * <p>Hamkor kanali tanlanmagan bo'lsa e'lon to'g'ridan-to'g'ri
 * joylanadi. Tanlangan bo'lsa — birinchi muvaffaqiyatli hamkor
 * postidan FORWARD qilinadi.
 *
 * <p>Nega forward va nega copy emas. "Forwarded from &lt;hamkor
 * kanali&gt;" sarlavhasi efBazaar e'lonni hamkorning auditoriyasidan
 * tortib olmayotganini, balki uning hamkorligini tasdiqlayotganini
 * ko'rsatadi. {@code copyMessage} tugmani saqlaydi, lekin bu
 * sarlavhani bermaydi — ikkalasini birga olib bo'lmaydi va biz
 * sarlavhani tanladik. Shuning uchun havola post MATNIDA ham turadi.
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
     * E'lon yaratildi.
     *
     * <p>Hamkor kanali buyurtma qilingan bo'lsa BU YERDA hech narsa
     * yuborilmaydi: rasmiy nusxa o'sha postdan forward qilinishi kerak
     * va u hali chiqmagan. {@link #onPartnerPostDelivered} kutadi.
     */
    @Transactional
    public void onListingCreated(Listing listing, boolean partnerChannelsOrdered) {
        if (!enabled() || official.existsById(listing.getId())) return;

        OfficialChannelPost row = new OfficialChannelPost();
        row.setListingId(listing.getId());
        official.save(row);

        if (!partnerChannelsOrdered) publishDirect(listing, row);
    }

    /**
     * Hamkor posti chiqdi — rasmiy nusxa shundan forward qilinadi.
     *
     * <p>BIRINCHI chiqqani manba bo'ladi. Bir e'lon uch kanalga
     * yuborilsa, uchalasini forward qilish rasmiy kanalga bir
     * akkauntning uch nusxasini tushirardi.
     */
    @Transactional
    public void onPartnerPostDelivered(ListingChannelPost post, PartnerChannel channel) {
        if (!enabled()) return;
        official.findById(post.getListingId())
                .filter(row -> OfficialChannelPost.State.PENDING.name().equals(row.getState()))
                .filter(row -> row.getSourcePostId() == null)
                .ifPresent(row -> {
                    row.setSourcePostId(post.getId());
                    official.save(row);
                    events.officialPostRequested(new PartnerAdEventPublisher.OfficialPostPayload(
                            post.getListingId(), officialChannel, null, null, null,
                            channel.getTelegramChannelId(), post.getTelegramMessageId()));
                });
    }

    /**
     * Hamkor posti chiqmadi.
     *
     * <p>Barcha buyurtmalar yiqilgan bo'lsa e'lon rasmiy kanalga
     * BUTUNLAY tushmay qolardi — hamkorga to'lay olmaganini e'lonning
     * o'zi bilan jazolash noto'g'ri. Shunda to'g'ridan-to'g'ri
     * joylaymiz.
     */
    @Transactional
    public void onPartnerPostFailed(UUID listingId) {
        if (!enabled()) return;
        Optional<OfficialChannelPost> pending = official.findById(listingId)
                .filter(row -> OfficialChannelPost.State.PENDING.name().equals(row.getState()))
                .filter(row -> row.getSourcePostId() == null);
        if (pending.isEmpty()) return;

        // Hali chiqishi mumkin bo'lgan buyurtma qolgan bo'lsa kutamiz:
        // forward har doim to'g'ridan-to'g'ri joylashdan afzal.
        boolean stillHopeful = posts.findByListingId(listingId).stream()
                .anyMatch(p -> State.HELD.name().equals(p.getState())
                        || State.AWAITING_FUNDS.name().equals(p.getState()));
        if (stillHopeful) return;

        listings.findById(listingId)
                .ifPresent(listing -> publishDirect(listing, pending.get()));
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
