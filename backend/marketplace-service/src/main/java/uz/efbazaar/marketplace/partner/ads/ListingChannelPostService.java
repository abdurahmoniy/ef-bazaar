package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.ListingChannelPost.State;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.ListingChannelPostRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Mavjud e'lonni kanallarga joylash va u qayerlarda chiqqanini aytish.
 *
 * <p>{@link ChannelPostService} pul va post oqimini biladi; bu yerda
 * esa E'LONGA oid shartlar turadi — kim so'rayapti va e'lon umuman
 * reklama qilinadigan holatdami.
 */
@Service
@RequiredArgsConstructor
public class ListingChannelPostService {

    private final ListingRepository listings;
    private final ListingChannelPostRepository posts;
    private final PartnerChannelRepository channels;
    private final ChannelPostService channelPosts;

    @Transactional
    public void order(UUID sellerId, UUID listingId, List<UUID> channelIds) {
        Listing listing = requireOwnListing(sellerId, listingId);
        // Sotilgan yoki o'chirilgan e'lonni reklama qilib bo'lmaydi:
        // post chiqar, uni bosgan odam esa mavjud bo'lmagan taklifga
        // tushardi — sotuvchi buning uchun to'lagan holda.
        if (listing.getStatus() != ListingStatus.ACTIVE) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Faqat faol e'lonni kanallarga joylash mumkin");
        }
        channelPosts.order(sellerId, listingId, channelIds);
    }

    /**
     * E'lon qaysi kanallarda, necha marta chiqqan.
     *
     * <p>Sotuvchi qayta yuborishdan oldin shuni ko'radi: kanalda
     * e'lonlar tez aylanadi va "qachon chiqqan edi" degan savolga
     * javobsiz qayta to'lash qorong'ida qaror qabul qilish bo'lardi.
     */
    @Transactional(readOnly = true)
    public List<PostedChannel> postedChannels(UUID sellerId, UUID listingId) {
        requireOwnListing(sellerId, listingId);

        List<ListingChannelPost> all = posts.findByListingIdOrderByCreatedAtDesc(listingId);
        if (all.isEmpty()) return List.of();

        Map<UUID, PartnerChannel> byId = channels
                .findAllById(all.stream().map(ListingChannelPost::getPartnerChannelId).toList())
                .stream().collect(Collectors.toMap(PartnerChannel::getId, Function.identity()));

        return all.stream()
                .collect(Collectors.groupingBy(ListingChannelPost::getPartnerChannelId))
                .entrySet().stream()
                .map(e -> {
                    PartnerChannel channel = byId.get(e.getKey());
                    List<ListingChannelPost> forChannel = e.getValue();
                    // Chiqqanlari sanaladi: to'lovni kutayotgan yoki
                    // chiqmay qolgan urinish "kanalda turibdi" degani
                    // emas va sotuvchini chalg'itardi.
                    List<ListingChannelPost> published = forChannel.stream()
                            .filter(p -> State.POSTED.name().equals(p.getState()))
                            .toList();
                    return new PostedChannel(
                            e.getKey(),
                            channel == null ? "Kanal" : channel.getTitle(),
                            published.size(),
                            published.stream()
                                    .map(ListingChannelPost::getPostedAt)
                                    .filter(java.util.Objects::nonNull)
                                    .max(Instant::compareTo).orElse(null),
                            channel != null && channel.isActive(),
                            channel == null ? BigDecimal.ZERO : channel.getPostPriceSom());
                })
                .sorted((a, b) -> a.channelTitle().compareToIgnoreCase(b.channelTitle()))
                .toList();
    }

    private Listing requireOwnListing(UUID sellerId, UUID listingId) {
        Listing listing = listings.findById(listingId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "E'lon topilmadi"));
        // Boshqa odamning e'lonini uning nomidan reklama qilib
        // bo'lmaydi — va bu so'rovchining hamyonidan pul yechardi.
        if (!listing.getSellerId().equals(sellerId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "E'lon topilmadi");
        }
        return listing;
    }

    /**
     * @param postedCount necha marta chiqqan — qayta yuborish cheklanmagan
     * @param currentPriceSom hamkorning BUGUNGI narxi, o'tgan to'lov emas
     */
    public record PostedChannel(
            UUID channelId,
            String channelTitle,
            int postedCount,
            Instant lastPostedAt,
            boolean channelActive,
            BigDecimal currentPriceSom) {}
}
