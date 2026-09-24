package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.account.UserAccount;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingCaptionBuilderTest {

    @Mock
    AttributeDefinitionRepository definitions;

    @Mock
    AuthSummaryClient users;

    @InjectMocks
    ListingCaptionBuilder builder;

    @ParameterizedTest
    @ValueSource(strings = {"seller_name", "@seller_name", "  seller_name  "})
    void seller_username_is_shown_before_listing_details(String username) {
        Listing listing = listing(List.of());
        when(users.resolve(listing.getSellerId())).thenReturn(Optional.of(
                seller(listing, username, 123456789L)));

        String out = builder.build(listing);

        assertThat(out).contains("</code>\n<b>Sotuvchi:</b> @seller_name\n<b>Narx:</b>");
        assertThat(out).doesNotContain("@@", "Sotuvchi Telegram ID:");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void seller_telegram_id_is_shown_when_username_is_missing(String username) {
        Listing listing = listing(List.of());
        when(users.resolve(listing.getSellerId())).thenReturn(Optional.of(
                seller(listing, username, 123456789L)));

        String out = builder.build(listing);

        assertThat(out).contains("<b>Sotuvchi Telegram ID:</b> <code>123456789</code>\n");
        assertThat(out).doesNotContain("<b>Sotuvchi:</b> @");
    }

    @Test
    void missing_seller_summary_does_not_prevent_caption_creation() {
        Listing listing = listing(List.of());
        when(users.resolve(listing.getSellerId())).thenReturn(Optional.empty());

        String out = builder.build(listing);

        assertThat(out).contains("<b>Listing</b>", "<b>Narx:</b>");
        assertThat(out).doesNotContain("Sotuvchi:", "Sotuvchi Telegram ID:", "null");
    }

    @Test
    void seller_username_is_html_escaped() {
        Listing listing = listing(List.of());
        when(users.resolve(listing.getSellerId())).thenReturn(Optional.of(
                seller(listing, "seller<&>", 123456789L)));

        assertThat(builder.build(listing)).contains("@seller&lt;&amp;&gt;");
    }

    @Test
    void seller_identity_survives_long_caption_truncation() {
        Listing listing = listing(List.of());
        listing.setAttributes(Map.of("note", "x".repeat(1500)));
        when(definitions.findAllByActiveTrueOrderByPositionAsc())
                .thenReturn(List.of(attrDef("note", "Izoh")));
        when(users.resolve(listing.getSellerId())).thenReturn(Optional.of(
                seller(listing, "seller_name", 123456789L)));

        String out = builder.build(listing);

        assertThat(out).contains("<b>Sotuvchi:</b> @seller_name");
        assertThat(out.length()).isLessThanOrEqualTo(1024);
        assertThat(countOccurrences(out, "<b>")).isEqualTo(countOccurrences(out, "</b>"));
        assertThat(countOccurrences(out, "<code>")).isEqualTo(countOccurrences(out, "</code>"));
    }

    private static UserSummary seller(Listing listing, String username, Long telegramId) {
        return new UserSummary(listing.getSellerId(), "Seller", username, telegramId,
                false, null, false);
    }

    @Test
    void card_list_over_five_is_capped_with_summary_tail() {
        AttributeDefinition players = attrDef("players", "Yulduz o'yinchilar");
        when(definitions.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of(players));

        List<Map<String, Object>> cards = new ArrayList<>();
        for (int i = 1; i <= 12; i++) {
            cards.add(Map.of(
                    "name", "Player " + i,
                    "card_type", "EPIC",
                    "overall_rating", 85 + i,
                    "position", "CF"));
        }

        String out = builder.build(listing(cards));

        long lines = out.lines().filter(l -> l.startsWith("• ")).count();
        // 5 rendered cards + 1 summary line
        assertThat(lines).isEqualTo(6L);
        assertThat(out).contains("va yana 7 ta karta");
        assertThat(out).contains("Player 1");
        assertThat(out).contains("Player 5");
        assertThat(out).doesNotContain("Player 6");
    }

    @Test
    void caption_never_ends_inside_an_html_tag_pair() {
        AttributeDefinition players = attrDef("players", "Yulduz o'yinchilar");
        when(definitions.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of(players));

        List<Map<String, Object>> cards = new ArrayList<>();
        for (int i = 1; i <= 12; i++) {
            cards.add(Map.of("name", "Player " + i, "card_type", "EPIC", "overall_rating", 90));
        }

        String out = builder.build(listing(cards));

        // Every <b> opens must have a matching </b>; same for <code> and <i>.
        assertThat(countOccurrences(out, "<b>")).isEqualTo(countOccurrences(out, "</b>"));
        assertThat(countOccurrences(out, "<code>")).isEqualTo(countOccurrences(out, "</code>"));
        assertThat(countOccurrences(out, "<i>")).isEqualTo(countOccurrences(out, "</i>"));
        assertThat(out.length()).isLessThanOrEqualTo(1024);
    }

    @Test
    void user_supplied_lt_in_description_is_escaped() {
        // No attribute stub needed — with an empty attrs map, build() skips
        // the definitions lookup entirely, so a when(...) here would trigger
        // Mockito's UnnecessaryStubbingException under STRICT_STUBS.
        Listing l = listing(List.of());
        l.setDescription("watch <script>alert(1)</script>");

        String out = builder.build(l);

        assertThat(out).doesNotContain("<script>");
        assertThat(out).contains("&lt;script&gt;");
    }

    /**
     * Akkount rasmlari ham media topikiga to'liq izoh bilan ketadi.
     *
     * <p>Ilgari u yerga faqat akkount nomi ketardi va admin rasmlardan
     * boshqa hech narsa ko'rmasdi — e'londa esa hammasi bor edi. Bir xil
     * akkount, ikki xil ko'rinish.
     */
    @Test
    void accountCaptionCarriesTheSameDetailAsAListing() {
        when(definitions.findAllByActiveTrueOrderByPositionAsc())
                .thenReturn(List.of(attrDef("team_strength", "Team Strength")));
        when(users.resolve(OWNER)).thenReturn(Optional.of(
                new UserSummary(OWNER, "Egasi", "gen1us_07", 42L, false, null, false)));

        String out = builder.build(account());

        assertThat(out).contains("<b>Akkount</b> <code>5c8016ad</code>");
        assertThat(out).contains("<b>Egasi:</b> @gen1us_07");
        assertThat(out).contains("<b>Team Strength:</b> 3230");
        assertThat(out).contains("3230 sila oshadi");
    }

    @Test
    void accountCaptionHasNoPriceLine() {
        // Akkountda narx yo'q — u e'lonning sozlamasi. "0 so'm" deb
        // yozish obmendagi xatoni takrorlardi.
        when(definitions.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of());
        when(users.resolve(OWNER)).thenReturn(Optional.empty());

        String out = builder.build(account());

        assertThat(out).doesNotContain("Narx", "so'm");
    }

    @Test
    void accountCaptionNeverCarriesTheEmail() {
        // Email faqat egasiniki. Media topigi — admin guruhi, va manzil
        // u yerga tushmasligi kerak.
        when(definitions.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of());
        when(users.resolve(OWNER)).thenReturn(Optional.empty());
        UserAccount account = account();
        account.setEmail("trade-05a64118@efbazaar.uz");

        String out = builder.build(account);

        assertThat(out).doesNotContain("trade-05a64118", "efbazaar.uz");
    }

    private static final UUID OWNER = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000000");

    private static UserAccount account() {
        return UserAccount.builder()
                .id(UUID.fromString("5c8016ad-0000-0000-0000-000000000000"))
                .ownerId(OWNER)
                .title("Asosiy akkaunt")
                .description("3230 sila oshadi")
                .attributes(new java.util.HashMap<>(Map.of("team_strength", 3230)))
                .mediaMessageIds(new ArrayList<>())
                .build();
    }

    private static Listing listing(List<Map<String, Object>> players) {
        Listing l = new Listing();
        l.setId(UUID.fromString("2c2052ab-0000-0000-0000-000000000000"));
        l.setSellerId(UUID.fromString("aaaaaaaa-0000-0000-0000-000000000000"));
        l.setPrice(new BigDecimal("300000"));
        l.setPriceNegotiable(true);
        Map<String, Object> attrs = new java.util.HashMap<>();
        if (!players.isEmpty()) {
            attrs.put("players", players);
        }
        l.setAttributes(attrs);
        return l;
    }

    private static AttributeDefinition attrDef(String key, String labelUz) {
        AttributeDefinition d = new AttributeDefinition();
        d.setKey(key);
        d.setLabelUz(labelUz);
        return d;
    }

    private static int countOccurrences(String haystack, String needle) {
        int count = 0;
        int idx = 0;
        while ((idx = haystack.indexOf(needle, idx)) != -1) {
            count++;
            idx += needle.length();
        }
        return count;
    }
}
