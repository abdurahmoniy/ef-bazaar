package uz.efbazaar.marketplace.cards.sync;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses efhub.com player pages by extracting Next.js __next_f.push payloads.
 * Faithful port of infra/scrapers/efhub/scrape.py:parse_player.
 */
@Component
public class PlayerPageParser {

    private static final Logger log = LoggerFactory.getLogger(PlayerPageParser.class);

    // Extracted with a linear scan, not regex: payloads run to hundreds of KB and
    // a per-character regex loop overflows the stack (java.util.regex recursion).
    private static final String PUSH_PREFIX = "self.__next_f.push([";
    private static final String PLAYER_KEY = "\"player\":";

    private static final Pattern BASE_STATS = Pattern.compile("\"baseStats\":(\\{[^}]+\\})");
    private static final Pattern SKILLS = Pattern.compile("\"playerSkills\":\\[([^\\]]*)\\]");
    private static final Pattern COM_SKILLS = Pattern.compile("\"comSkills\":\\[([^\\]]*)\\]");
    private static final Pattern ADD_POS = Pattern.compile("\"additionalPositions\":(\\[[^\\]]*\\])");
    private static final Pattern QUOTED_TOKEN = Pattern.compile("\"([^\"]+)\"");

    private final ObjectMapper mapper;

    public PlayerPageParser(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public ScrapedCard parse(String html, long pidHint) {
        return parse(html, pidHint, null);
    }

    /**
     * @param maxOvr max-level OVR taken from the player index entry ("o"). The
     *               player page only carries the level-1 rating — efhub derives
     *               the maxed one in the browser from the progression curve —
     *               so the caller has to supply it.
     */
    public ScrapedCard parse(String html, long pidHint, Integer maxOvr) {
        int from = 0;
        int idx;
        while ((idx = html.indexOf(PUSH_PREFIX, from)) >= 0) {
            from = idx + PUSH_PREFIX.length();
            String rawQuoted = extractPushString(html, from);
            if (rawQuoted == null) {
                continue;
            }
            String decoded;
            try {
                decoded = mapper.readValue(rawQuoted, String.class);
            } catch (Exception e) {
                continue;
            }
            if (!decoded.contains("\"playerType\":") || !decoded.contains("\"baseStats\":")) {
                continue;
            }
            ScrapedCard card = build(decoded, pidHint, maxOvr);
            if (card != null) {
                return card;
            }
        }
        return null;
    }

    /**
     * Reads the string literal of a {@code self.__next_f.push([<n>,"..."])} call.
     * {@code pos} points just past the prefix. Returns the literal with its quotes
     * (ready for Jackson), or null if the payload has a different shape.
     */
    private static String extractPushString(String html, int pos) {
        int n = html.length();
        int i = pos;
        int digitsStart = i;
        while (i < n && Character.isDigit(html.charAt(i))) {
            i++;
        }
        if (i == digitsStart || i >= n || html.charAt(i) != ',') {
            return null;
        }
        i++;
        while (i < n && Character.isWhitespace(html.charAt(i))) {
            i++;
        }
        if (i >= n || html.charAt(i) != '"') {
            return null;
        }
        int quoteStart = i;
        i++;
        while (i < n) {
            char c = html.charAt(i);
            if (c == '\\') {
                i += 2;
            } else if (c == '"') {
                return html.startsWith("])", i + 1) ? html.substring(quoteStart, i + 1) : null;
            } else {
                i++;
            }
        }
        return null;
    }

    /**
     * Returns the {@code "player":{...}} block (balanced braces), or null.
     */
    private static String extractPlayerBlock(String decoded) {
        int idx = decoded.indexOf(PLAYER_KEY);
        if (idx < 0 || idx + PLAYER_KEY.length() >= decoded.length()
                || decoded.charAt(idx + PLAYER_KEY.length()) != '{') {
            return null;
        }
        int depth = 0;
        for (int i = idx + PLAYER_KEY.length(); i < decoded.length(); i++) {
            char c = decoded.charAt(i);
            if (c == '{') {
                depth++;
            } else if (c == '}') {
                depth--;
                if (depth == 0) {
                    return decoded.substring(idx, i + 1);
                }
            }
        }
        return null;
    }

    private ScrapedCard build(String decoded, long pidHint, Integer maxOvr) {
        String block = extractPlayerBlock(decoded);
        String playerBlob = block != null ? block : decoded;

        long efhubId = pidHint;
        String idStr = matchStr(playerBlob, "id");
        if (idStr != null) {
            try {
                efhubId = Long.parseLong(idStr);
            } catch (NumberFormatException ignored) {
                // keep pidHint
            }
        }

        Integer playerType = matchInt(playerBlob, "playerType");
        if (playerType == null) {
            return null;
        }

        Map<String, Integer> baseStats = parseBaseStats(decoded);
        List<String> skills = parseStringArray(decoded, SKILLS);
        List<String> comSkills = parseStringArray(decoded, COM_SKILLS);

        Matcher addPosM = ADD_POS.matcher(decoded);
        String addPosJson = addPosM.find() ? addPosM.group(1) : null;

        return new ScrapedCard(
                efhubId,
                matchStr(playerBlob, "name"),
                matchStr(playerBlob, "nameJa"),
                matchStr(playerBlob, "nameZh"),
                matchStr(playerBlob, "team"),
                matchStr(playerBlob, "league"),
                matchStr(playerBlob, "nationality"),
                matchStr(playerBlob, "nationalityCode"),
                matchStr(playerBlob, "position"),
                matchStr(playerBlob, "playingStyle"),
                matchInt(playerBlob, "overallRating"),
                maxOvr,
                playerType,
                matchInt(playerBlob, "age"),
                matchInt(playerBlob, "height"),
                matchInt(playerBlob, "weight"),
                matchStr(playerBlob, "preferredFoot"),
                matchInt(playerBlob, "weakFootUsage"),
                matchInt(playerBlob, "weakFootAccuracy"),
                matchStr(playerBlob, "imageUrl"),
                baseStats,
                skills,
                comSkills,
                addPosJson,
                // rawJson=null → CardWriter re-serialises via Jackson. The raw
                // Next.js chunk we started from is not valid JSON (has the
                // "<hex>:" flight/RSC prefix) so it can't be stored in a JSONB
                // column directly. Matches load.py which json.dumps(row) too.
                null
        );
    }

    private Map<String, Integer> parseBaseStats(String decoded) {
        Matcher m = BASE_STATS.matcher(decoded);
        if (!m.find()) {
            return Map.of();
        }
        try {
            return mapper.readValue(m.group(1), new TypeReference<Map<String, Integer>>() {});
        } catch (Exception e) {
            log.debug("baseStats parse failed: {}", e.toString());
            return new HashMap<>();
        }
    }

    private static List<String> parseStringArray(String decoded, Pattern arrayPattern) {
        Matcher m = arrayPattern.matcher(decoded);
        if (!m.find()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        Matcher tokens = QUOTED_TOKEN.matcher(m.group(1));
        while (tokens.find()) {
            out.add(tokens.group(1));
        }
        return out;
    }

    private static String matchStr(String blob, String field) {
        Pattern p = Pattern.compile("\"" + Pattern.quote(field) + "\":\"([^\"]*)\"");
        Matcher m = p.matcher(blob);
        return m.find() ? m.group(1) : null;
    }

    private static Integer matchInt(String blob, String field) {
        Pattern p = Pattern.compile("\"" + Pattern.quote(field) + "\":(-?\\d+)");
        Matcher m = p.matcher(blob);
        if (m.find()) {
            try {
                return Integer.parseInt(m.group(1));
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
