package uz.efbazaar.marketplace.inline;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.partner.ads.ChannelPostCaption;
import uz.efbazaar.marketplace.partner.ads.ListingDeepLink;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * A seller's own active listings, shaped for Telegram inline mode
 * (`@EfBazaarBot` in any chat). Identity comes only from the Telegram user id
 * Telegram itself attached to the inline query; the query text only filters.
 * The post text and button are the official channel's, so a shared post looks
 * exactly like the channel one.
 */
@Service
@RequiredArgsConstructor
public class InlineListingService {

    static final int PAGE = 20;
    private static final int PLAYERS_IN_DESCRIPTION = 3;

    private final ListingRepository listings;
    private final AuthSummaryClient auth;
    private final ListingDeepLink deepLink;

    public record InlineListingItem(UUID listingId, String title, String description,
                                    String captionHtml, String coverFileId, String buttonUrl) {}

    public record InlinePage(boolean linked, List<InlineListingItem> items, Integer nextOffset) {}

    @Transactional(readOnly = true)
    public InlinePage find(long telegramId, String query, int offset) {
        Optional<AuthSummaryClient.UserSummary> user = auth.resolveByTelegramId(telegramId);
        if (user.isEmpty()) return new InlinePage(false, List.of(), null);

        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        List<Listing> matching = listings
                .findBySellerIdAndStatusOrderByCreatedAtDesc(user.get().id(), ListingStatus.ACTIVE)
                .stream().filter(l -> q.isEmpty() || matches(l, q)).toList();

        int from = Math.max(0, offset);
        if (from >= matching.size()) return new InlinePage(true, List.of(), null);
        int to = Math.min(matching.size(), from + PAGE);
        List<InlineListingItem> items = matching.subList(from, to).stream().map(this::item).toList();
        return new InlinePage(true, items, to < matching.size() ? to : null);
    }

    private static boolean matches(Listing l, String q) {
        String players = ChannelPostCaption.plainPlayers(l.getAttributes(), Integer.MAX_VALUE);
        return players.toLowerCase(Locale.ROOT).contains(q)
                || (l.getDescription() != null && l.getDescription().toLowerCase(Locale.ROOT).contains(q));
    }

    private InlineListingItem item(Listing l) {
        Map<String, Object> a = l.getAttributes() == null ? Map.of() : l.getAttributes();
        List<String> media = l.getMediaMessageIds();
        return new InlineListingItem(
                l.getId(),
                title(l.getPrice(), a.get("highest_division_level")),
                description(a),
                ChannelPostCaption.of(l, deepLink.webUrl(l.getId(), null)),
                media == null || media.isEmpty() ? null : media.get(0),
                deepLink.buttonUrl(l.getId(), null));
    }

    static String title(BigDecimal price, Object division) {
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(Locale.ROOT);
        symbols.setGroupingSeparator(' ');
        String money = new DecimalFormat("#,##0", symbols)
                .format(price == null ? BigDecimal.ZERO : price) + " so'm";
        return division == null ? money : money + " · Division " + division;
    }

    static String description(Map<String, Object> a) {
        List<String> parts = new ArrayList<>();
        if (a.get("ios_coins") != null) parts.add("iOS " + a.get("ios_coins"));
        if (a.get("android_coins") != null) parts.add("Android " + a.get("android_coins"));
        if (a.get("team_strength") != null) parts.add("Kuch " + a.get("team_strength"));
        String players = ChannelPostCaption.plainPlayers(a, PLAYERS_IN_DESCRIPTION);
        String first = String.join(" · ", parts);
        if (players.isEmpty()) return first;
        return first.isEmpty() ? players : first + "\n" + players;
    }
}
