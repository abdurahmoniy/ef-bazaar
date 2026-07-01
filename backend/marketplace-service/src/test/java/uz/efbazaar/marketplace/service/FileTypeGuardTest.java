package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileTypeGuardTest {

    private static final List<String> ALLOWED = List.of(
            "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif");

    // ---------- happy path ----------

    @Test
    void detectsJpeg() {
        assertThat(FileTypeGuard.detect(bytes(0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10)))
                .isEqualTo("image/jpeg");
    }

    @Test
    void detectsPng() {
        assertThat(FileTypeGuard.detect(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00)))
                .isEqualTo("image/png");
    }

    @Test
    void detectsWebp() {
        byte[] payload = new byte[16];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, payload, 0, 4);
        payload[4] = 0x24; payload[5] = 0x00; payload[6] = 0x00; payload[7] = 0x00;
        System.arraycopy("WEBP".getBytes(StandardCharsets.US_ASCII), 0, payload, 8, 4);
        assertThat(FileTypeGuard.detect(payload)).isEqualTo("image/webp");
    }

    @Test
    void detectsHeic() {
        byte[] payload = new byte[16];
        payload[0] = 0x00; payload[1] = 0x00; payload[2] = 0x00; payload[3] = 0x18;
        System.arraycopy("ftyp".getBytes(StandardCharsets.US_ASCII), 0, payload, 4, 4);
        System.arraycopy("heic".getBytes(StandardCharsets.US_ASCII), 0, payload, 8, 4);
        assertThat(FileTypeGuard.detect(payload)).isEqualTo("image/heic");
    }

    @Test
    void detectsHeicMif1Brand() {
        byte[] payload = new byte[16];
        System.arraycopy("ftyp".getBytes(StandardCharsets.US_ASCII), 0, payload, 4, 4);
        System.arraycopy("mif1".getBytes(StandardCharsets.US_ASCII), 0, payload, 8, 4);
        assertThat(FileTypeGuard.detect(payload)).isEqualTo("image/heic");
    }

    // ---------- attack path ----------

    @Test
    void rejectsBashScriptWithSpoofedContentType() {
        byte[] shebang = "#!/bin/bash\necho pwned".getBytes(StandardCharsets.US_ASCII);
        assertThat(FileTypeGuard.detect(shebang)).isNull();

        assertThatThrownBy(() ->
                FileTypeGuard.requireAllowed(shebang, "image/jpeg", ALLOWED))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("magic byte mos kelmadi");
    }

    @Test
    void rejectsSvgEvenIfContentTypeSaysImage() {
        // Common SVG XSS vector.
        byte[] svg = ("<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\">"
                + "<script>alert(1)</script></svg>").getBytes(StandardCharsets.US_ASCII);
        assertThat(FileTypeGuard.detect(svg)).isNull();

        assertThatThrownBy(() ->
                FileTypeGuard.requireAllowed(svg, "image/svg+xml", ALLOWED))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsPngPayloadDeclaredAsJpeg() {
        // Bytes are really PNG; header claims JPEG — mismatch.
        byte[] pngBytes = bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00);

        assertThatThrownBy(() ->
                FileTypeGuard.requireAllowed(pngBytes, "image/jpeg", ALLOWED))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("mos kelmadi");
    }

    @Test
    void heifDeclaredContentTypeCanonicalisesToHeic() {
        byte[] heic = new byte[16];
        System.arraycopy("ftyp".getBytes(StandardCharsets.US_ASCII), 0, heic, 4, 4);
        System.arraycopy("heic".getBytes(StandardCharsets.US_ASCII), 0, heic, 8, 4);
        // image/heif is the alt MIME — validator must accept it against the same bytes.
        assertThat(FileTypeGuard.requireAllowed(heic, "image/heif", ALLOWED))
                .isEqualTo("image/heic");
    }

    @Test
    void rejectsTruncatedFile() {
        assertThat(FileTypeGuard.detect(new byte[]{0x00})).isNull();
        assertThat(FileTypeGuard.detect(null)).isNull();
    }

    @Test
    void allowsMissingContentTypeIfBytesMatch() {
        // Declared Content-Type is optional per HTTP; the sniff alone should be
        // enough when it's absent.
        byte[] jpeg = bytes(0xFF, 0xD8, 0xFF, 0xE0);
        assertThat(FileTypeGuard.requireAllowed(jpeg, null, ALLOWED))
                .isEqualTo("image/jpeg");
        assertThat(FileTypeGuard.requireAllowed(jpeg, "", ALLOWED))
                .isEqualTo("image/jpeg");
    }

    // ---------- helpers ----------

    private static byte[] bytes(int... vals) {
        byte[] out = new byte[vals.length];
        for (int i = 0; i < vals.length; i++) out[i] = (byte) vals[i];
        return out;
    }
}
