package uz.efbazaar.marketplace.service;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

/**
 * Magic-byte based image format detector. The client-supplied
 * {@code Content-Type} header and filename extension are both attacker-controlled
 * — a malicious upload can label a bash script as {@code image/jpeg}. This guard
 * inspects the actual leading bytes of the payload against known image
 * signatures, so a spoofed header alone is not enough to slip a non-image past
 * validation.
 *
 * <p>Supported formats:
 * <ul>
 *   <li>JPEG — {@code FF D8 FF ...}</li>
 *   <li>PNG  — {@code 89 50 4E 47 0D 0A 1A 0A}</li>
 *   <li>WebP — {@code "RIFF"} at bytes 0-3, {@code "WEBP"} at bytes 8-11</li>
 *   <li>HEIC/HEIF — ISO-BMFF: {@code "ftyp"} at bytes 4-7, brand in bytes 8-11
 *       matching one of {@code heic|heix|mif1|msf1|hevc|hevx|heim|heis|hevm|hevs}</li>
 * </ul>
 *
 * <p>SVG is intentionally rejected — it is XML and can carry active content
 * (script tags, external references) that XSS scanners often miss when the file
 * is served or previewed.
 */
public final class FileTypeGuard {

    /** Read this many bytes from the start of each file. Enough for every
     *  signature above; HEIC needs 12. */
    public static final int SNIFF_BYTES = 32;

    private static final byte[] JPEG   = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG    = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A};
    private static final byte[] RIFF   = {'R', 'I', 'F', 'F'};
    private static final byte[] WEBP   = {'W', 'E', 'B', 'P'};
    private static final byte[] FTYP   = {'f', 't', 'y', 'p'};

    private static final Set<String> HEIF_BRANDS = Set.of(
            "heic", "heix", "mif1", "msf1", "hevc", "hevx", "heim", "heis", "hevm", "hevs");

    private FileTypeGuard() {}

    /**
     * @return canonical MIME type of the sniffed bytes, or {@code null} if the
     *         payload does not match any accepted image signature.
     */
    public static String detect(byte[] head) {
        if (head == null || head.length < 3) return null;

        if (startsWith(head, JPEG)) return "image/jpeg";
        if (head.length >= 8 && startsWith(head, PNG)) return "image/png";

        // WebP: "RIFF" at 0-3, size at 4-7, "WEBP" at 8-11
        if (head.length >= 12 && startsWith(head, RIFF) && matchesAt(head, 8, WEBP)) {
            return "image/webp";
        }

        // ISO Base Media (HEIC/HEIF/etc): box size at 0-3, "ftyp" at 4-7, brand at 8-11
        if (head.length >= 12 && matchesAt(head, 4, FTYP)) {
            String brand = new String(head, 8, 4);
            if (HEIF_BRANDS.contains(brand)) return "image/heic";
        }

        return null;
    }

    /**
     * Cross-checks the client-declared Content-Type against the sniffed bytes.
     * Both must be in {@code allowed}, and both must agree. Returns the
     * canonical MIME the file was verified as.
     *
     * @throws IllegalArgumentException if the file is not an accepted image
     *         (or the declared type disagrees with the sniffed bytes).
     */
    public static String requireAllowed(byte[] head,
                                        String declaredContentType,
                                        List<String> allowed) {
        String detected = detect(head);
        if (detected == null) {
            throw new IllegalArgumentException("Fayl haqiqiy rasm emas (magic byte mos kelmadi)");
        }
        if (!allowed.contains(detected)) {
            throw new IllegalArgumentException("Ushbu rasm formati ruxsat etilmagan: " + detected);
        }
        // Declared Content-Type is optional in HTTP spec; if present, it must
        // agree with the sniffed format. HEIC/HEIF both map to image/heic here.
        if (declaredContentType != null && !declaredContentType.isBlank()) {
            String normalized = normalizeHeif(declaredContentType.toLowerCase());
            if (!normalized.equals(detected)) {
                throw new IllegalArgumentException(
                        "Content-Type '" + declaredContentType + "' fayl bayt'lariga mos kelmadi ("
                                + detected + ")");
            }
        }
        return detected;
    }

    private static String normalizeHeif(String contentType) {
        return contentType.equals("image/heif") ? "image/heic" : contentType;
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        if (data.length < prefix.length) return false;
        return Arrays.equals(data, 0, prefix.length, prefix, 0, prefix.length);
    }

    private static boolean matchesAt(byte[] data, int offset, byte[] pattern) {
        if (data.length < offset + pattern.length) return false;
        return Arrays.equals(data, offset, offset + pattern.length,
                pattern, 0, pattern.length);
    }
}
