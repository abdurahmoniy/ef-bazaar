package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingCaptionBuilderTest {

    @Mock
    AttributeDefinitionRepository definitions;

    @InjectMocks
    ListingCaptionBuilder builder;

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
        when(definitions.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of());
        Listing l = listing(List.of());
        l.setDescription("watch <script>alert(1)</script>");

        String out = builder.build(l);

        assertThat(out).doesNotContain("<script>");
        assertThat(out).contains("&lt;script&gt;");
    }

    private static Listing listing(List<Map<String, Object>> players) {
        Listing l = new Listing();
        l.setId(UUID.fromString("2c2052ab-0000-0000-0000-000000000000"));
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
