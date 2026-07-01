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

    private static final Pattern NEXT_F_PUSH = Pattern.compile(
            "self\\.__next_f\\.push\\(\\[(\\d+),\\s*(\"(?:[^\"\\\\]|\\\\.)*\")\\]\\)");

    // "player":{ ... } with up to one level of nested braces
    private static final Pattern PLAYER_BLOCK = Pattern.compile(
            "\"player\":\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}");

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
        Matcher m = NEXT_F_PUSH.matcher(html);
        while (m.find()) {
            String rawQuoted = m.group(2);
            String decoded;
            try {
                decoded = mapper.readValue(rawQuoted, String.class);
            } catch (Exception e) {
                continue;
            }
            if (!decoded.contains("\"playerType\":") || !decoded.contains("\"baseStats\":")) {
                continue;
            }
            ScrapedCard card = build(decoded, pidHint);
            if (card != null) {
                return card;
            }
        }
        return null;
    }

    private ScrapedCard build(String decoded, long pidHint) {
        Matcher pm = PLAYER_BLOCK.matcher(decoded);
        String playerBlob = pm.find() ? pm.group(0) : decoded;

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
                decoded
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
