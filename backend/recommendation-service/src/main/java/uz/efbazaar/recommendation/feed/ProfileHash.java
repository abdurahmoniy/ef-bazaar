package uz.efbazaar.recommendation.feed;

import uz.efbazaar.recommendation.match.Criterion;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** {@code sha256("efhubId:og'irlik,...")} — karta ID bo'yicha tartiblangan, og'irlik kanonik ko'rinishda. */
public final class ProfileHash {

    private static final Pattern WELL_FORMED = Pattern.compile("^[0-9a-f]{64}$");

    private ProfileHash() {
    }

    public static String of(List<Criterion> profile) {
        String canonical = profile.stream()
                .sorted(Comparator.comparingLong(Criterion::efhubId))
                .map(c -> c.efhubId() + ":" + c.weight().stripTrailingZeros().toPlainString())
                .collect(Collectors.joining(","));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Mijozdan kelgan qiymat Redis kalitiga tushadi — faqat aniq shakl qabul qilinadi. */
    public static boolean isWellFormed(String hash) {
        return hash != null && WELL_FORMED.matcher(hash).matches();
    }
}
