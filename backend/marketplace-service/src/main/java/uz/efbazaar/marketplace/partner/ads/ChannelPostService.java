package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdEventPublisher.ChannelPostPayload;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

/**
 * Kanalga e'lon joylash buyurtmasi.
 *
 * <p>PUL TO'PLAM UCHUN BIR YO'LA USHLANADI. Sotuvchi to'plamni tanlaydi
 * va bitta summani ko'radi; har kanalni alohida yechsak, 12 000 so'mi
 * bor odam uchta 5 000 lik kanal tanlab, ikkitasini olib qolardi — u
 * rozi bo'lmagan natija.
 *
 * <p>To'lov va qaytarish esa HAR POST bo'yicha: postlar birma-bir
 * chiqadi va biri yiqilib ikkinchisi o'tishi mumkin. {@code USER_HELD}
 * foydalanuvchi bo'yicha umumiy hisob, shuning uchun bitta holddan ikki
 * hamkorga to'lab, qoldig'ini qaytarish qo'shimcha mexanizmsiz ishlaydi.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChannelPostService {

    private final PartnerChannelRepository channels;
    private final ListingChannelPostRepository posts;
    private final PartnerAdClient payments;
    private final PartnerAdEventPublisher events;
    private final OfficialChannelService officialChannel;
    private final PartnerPricing pricing;
    private final ListingRepository listings;

    @Value("${app.web.base-url:https://efbazaar.uz}")
    private String webBaseUrl;

    /**
     * Tanlangan kanallarga buyurtma beradi.
     *
     * <p>Mablag' yetmasa buyurtma {@code AWAITING_FUNDS} bo'lib qoladi
     * va E'LON YO'QOLMAYDI: to'ldirilgan hamyon bilan "To'lash" tugmasi
     * uni davom ettiradi. To'lиб bo'lmagani uchun e'lonni yo'qotish
     * himoyalab bo'lmaydigan narsa.
     */
    @Transactional
    public void order(UUID sellerId, UUID listingId, List<UUID> channelIds) {
        if (channelIds == null || channelIds.isEmpty()) return;

        // Frontend takrorlashi mumkin, baza esa (listing, channel) ni
        // yagona deb biladi — takrorni shu yerda yo'qotamiz, INSERT
        // yiqilishini kutmaymiz.
        List<PartnerChannel> chosen = new LinkedHashSet<>(channelIds).stream()
                .map(this::requireOrderable)
                .toList();

        UUID orderId = UUID.randomUUID();
        List<ListingChannelPost> ordered = new ArrayList<>(chosen.size());
        BigDecimal total = BigDecimal.ZERO;

        for (PartnerChannel channel : chosen) {
            BigDecimal price = pricing.priceFor(channel, null);
            total = total.add(price);

            ListingChannelPost post = new ListingChannelPost();
            post.setId(UUID.randomUUID());
            post.setOrderId(orderId);
            post.setListingId(listingId);
            post.setPartnerChannelId(channel.getId());
            post.setPriceSom(price);
            post.setState(State.AWAITING_FUNDS.name());
            ordered.add(post);
        }

        boolean funded = true;
        try {
            payments.hold(orderId, sellerId, total);
        } catch (ResponseStatusException e) {
            // Mablag' yetmadi. Qatorlar AWAITING_FUNDS bo'lib saqlanadi
            // va foydalanuvchi hamyonini to'ldirib davom ettiradi.
            funded = false;
            log.info("Reklama buyurtmasi {} mablag' kutmoqda: {}", orderId, e.getReason());
        }

        if (funded) {
            ordered.forEach(p -> p.setState(State.HELD.name()));
        }
        posts.saveAll(ordered);

        if (funded) {
            for (int i = 0; i < ordered.size(); i++) {
                publish(ordered.get(i), chosen.get(i));
            }
        }
    }

    private PartnerChannel requireOrderable(UUID channelId) {
        PartnerChannel channel = channels.findById(channelId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Kanal topilmadi"));
        if (!channel.isActive()) {
            // Hamkorlik to'xtagan kanalga buyurtma berib bo'lmaydi: bot
            // u yerda administrator emas va post hech qachon chiqmaydi.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Bu kanal endi e'lon qabul qilmaydi: " + channel.getTitle());
        }
        return channel;
    }

    private void publish(ListingChannelPost post, PartnerChannel channel) {
        Listing listing = listings.findById(post.getListingId()).orElse(null);
        if (listing == null) {
            // E'lon o'chirilgan bo'lsa post chiqarishning ma'nosi yo'q va
            // matn ham yig'ilmaydi. Sotuvchining puli ushlangan holda
            // qolmasin.
            onFailed(post.getId(), "E'lon topilmadi");
            return;
        }
        String url = buttonUrl(post.getListingId(), channel.getLinkCode());
        events.postRequested(post, ChannelPostPayload.of(
                post, channel,
                // Hamkorning o'z ko'rinishi: qaysi bloklar, qaysi
                // tartibda va o'z footeri bilan.
                ChannelPostCaption.of(listing, url,
                        ChannelPostLayout.parse(channel.getPostBlocks() == null
                                ? null : java.util.List.of(channel.getPostBlocks())),
                        channel.getPostFooter()),
                firstMedia(listing),
                url));
    }

    /**
     * Postga qo'yiladigan rasm.
     *
     * <p>Nomi yanglishtiradi: {@code mediaMessageIds} aslida yuklangan
     * fayl identifikatorlarini saqlaydi. Rasmsiz e'lon ham chiqadi —
     * shunda oddiy matnli xabar bo'ladi.
     */
    private String firstMedia(Listing listing) {
        List<String> media = listing.getMediaMessageIds();
        return media == null || media.isEmpty() ? null : media.get(0);
    }

    /**
     * Post ostidagi tugma manzili.
     *
     * <p>Har kanal O'Z kodini olib yuradi — bosilish qaysi kanaldan
     * kelganini shundan bilamiz, va savdo ulushi shunga bog'lanadi.
     */
    private String buttonUrl(UUID listingId, String linkCode) {
        return webBaseUrl + "/marketplace/" + listingId + "?p=" + linkCode;
    }

    private UUID sellerOf(ListingChannelPost post) {
        return listings.findById(post.getListingId())
                .map(Listing::getSellerId)
                .orElseThrow(() -> new IllegalStateException(
                        "Post " + post.getId() + " uchun e'lon topilmadi: " + post.getListingId()));
    }

    /**
     * Post chiqdi — hamkorga to'laymiz.
     *
     * <p>Qayta yetkazilgan natija ikki marta to'lamaydi: holat
     * allaqachon {@code POSTED} bo'lsa qaytamiz.
     */
    @Transactional
    public void onPosted(UUID postId, String telegramMessageId) {
        posts.findById(postId).ifPresent(post -> {
            if (!State.HELD.name().equals(post.getState())) return;

            PartnerChannel channel = channels.findById(post.getPartnerChannelId()).orElseThrow();
            // Sotuvchi BU YERDA topiladi, bot yuborgan ma'lumotdan emas:
            // bot e'lon kimniki ekanini bilmaydi, va bilishi ham kerak
            // emas — u faqat postni chiqaradi.
            payments.settle(post.getId(), sellerOf(post), channel.getPartnerUserId(), post.getPriceSom());

            post.setState(State.POSTED.name());
            post.setTelegramMessageId(telegramMessageId);
            post.setPostedAt(Instant.now());
            posts.save(post);

            replacePrevious(post, channel);
            // Rasmiy kanaldagi nusxa SHU postdan forward qilinadi —
            // "Forwarded from" sarlavhasi hamkorlikni tasdiqlaydi.
            officialChannel.onPartnerPostDelivered(post, channel);
        });
    }

    /**
     * Qayta yuborilgan e'lonning oldingi posti kanaldan olinadi.
     *
     * <p>YANGISI CHIQQANDAN KEYIN o'chiriladi, oldin emas: yangisi
     * chiqmay qolsa e'lon kanaldan butunlay yo'qolar va sotuvchi
     * to'lagan bo'lardi.
     *
     * <p>Qator o'chirilmaydi — u to'langan va hamkor undan daromad
     * olgan. {@code replacedAt} faqat "bu qatordagi xabar endi
     * kanalda yo'q" deb belgilaydi.
     */
    private void replacePrevious(ListingChannelPost fresh, PartnerChannel channel) {
        for (ListingChannelPost old : posts
                .findByListingIdAndPartnerChannelIdAndStateAndReplacedAtIsNull(
                        fresh.getListingId(), fresh.getPartnerChannelId(), State.POSTED.name())) {
            if (old.getId().equals(fresh.getId())) continue;
            old.setReplacedAt(Instant.now());
            posts.save(old);
            // Xabar identifikatorisiz o'chirib bo'lmaydi: post chiqqan,
            // lekin bot identifikatorni qaytarmagan holat.
            if (old.getTelegramMessageId() != null && !old.getTelegramMessageId().isBlank()) {
                events.postDeleteRequested(old, channel);
            }
        }
    }

    /**
     * Hamkorlik to'xtadi — chiqmagan buyurtmalarni qaytaramiz.
     *
     * <p>Bu postlar HECH QACHON chiqmaydi: bot kanalda administrator
     * emas. Ularni qoldirsak sotuvchining puli ushlangan holda,
     * hech kim kutmaydigan holatda qolib ketardi.
     *
     * <p>CHIQIB BO'LGANLARIGA TEGILMAYDI: reklama yetkazilgan va
     * to'langan, va u keltirgan savdolar ham to'lanaveradi — `trades`
     * dagi muhrlangan qiymat kanalning faolligiga qaramaydi.
     */
    @Transactional
    public void refundStranded(UUID partnerChannelId) {
        for (ListingChannelPost post : posts.findByPartnerChannelIdAndState(
                partnerChannelId, State.HELD.name())) {
            try {
                payments.refund(post.getId(), sellerOf(post), post.getPriceSom());
                post.setState(State.REFUNDED.name());
                post.setError("Hamkorlik to'xtatildi");
                posts.save(post);
            } catch (RuntimeException e) {
                // Bir buyurtmaning yiqilishi qolganlarini to'xtatmaydi:
                // ular boshqa-boshqa sotuvchilarning puli.
                log.error("Ushlangan buyurtma qaytarilmadi: post={}", post.getId(), e);
            }
        }
    }

    /** Post chiqmadi — sotuvchiga qaytaramiz. */
    @Transactional
    public void onFailed(UUID postId, String error) {
        posts.findById(postId).ifPresent(post -> {
            if (!State.HELD.name().equals(post.getState())) return;

            payments.refund(post.getId(), sellerOf(post), post.getPriceSom());
            post.setState(State.REFUNDED.name());
            post.setError(error);
            posts.save(post);

            // Barcha buyurtmalar yiqilgan bo'lsa e'lon rasmiy kanalga
            // butunlay tushmay qolardi. Hamkorga chiqara olmaganini
            // e'lonning o'zi bilan jazolash noto'g'ri.
            officialChannel.onPartnerPostFailed(post.getListingId());
        });
    }
}
