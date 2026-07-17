package uz.efbazaar.trade.mail;

import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.mail.service.HtmlSanitizer;

import static org.assertj.core.api.Assertions.assertThat;

class HtmlSanitizerTest {

    private final HtmlSanitizer sanitizer = new HtmlSanitizer();

    @Test
    void stripsScriptTag() {
        String out = sanitizer.sanitize("<p>Hello</p><script>alert(1)</script>");
        assertThat(out).contains("Hello");
        assertThat(out).doesNotContain("<script");
        assertThat(out).doesNotContain("alert");
    }

    @Test
    void stripsIframeAndObject() {
        String out = sanitizer.sanitize(
                "<p>x</p><iframe src='https://evil.example'></iframe><object data='x'></object>");
        assertThat(out).doesNotContain("<iframe");
        assertThat(out).doesNotContain("<object");
    }

    @Test
    void stripsOnEventHandlerAttributes() {
        String out = sanitizer.sanitize("<a href='https://example.com' onclick='hax()'>click</a>");
        assertThat(out).doesNotContain("onclick");
        assertThat(out).contains("href=\"https://example.com\"");
    }

    @Test
    void stripsImgTagCompletely() {
        // External images can be used as tracking pixels — MVP just drops them.
        String out = sanitizer.sanitize("<p>hi</p><img src='https://tracker.example/pixel.gif'>");
        assertThat(out).doesNotContain("<img");
        assertThat(out).doesNotContain("tracker.example");
    }

    @Test
    void stripsInlineStyleAttribute() {
        String out = sanitizer.sanitize("<p style=\"background:url(https://evil.example/x)\">hi</p>");
        assertThat(out).doesNotContain("style=");
        assertThat(out).doesNotContain("evil.example");
    }

    @Test
    void rewritesLinksWithSafeTargetAndRel() {
        String out = sanitizer.sanitize("<a href='https://example.com'>go</a>");
        assertThat(out).contains("target=\"_blank\"");
        assertThat(out).contains("rel=\"noopener noreferrer\"");
    }

    @Test
    void dropsJavascriptUrl() {
        String out = sanitizer.sanitize("<a href='javascript:alert(1)'>bad</a>");
        // Jsoup Safelist drops the href entirely (scheme not on allowlist).
        assertThat(out).doesNotContain("javascript:");
    }

    @Test
    void allowsMailtoLinks() {
        String out = sanitizer.sanitize("<a href='mailto:x@example.com'>mail</a>");
        assertThat(out).contains("href=\"mailto:x@example.com\"");
    }

    @Test
    void preservesBasicFormatting() {
        String out = sanitizer.sanitize("<p><b>Bold</b> and <em>italic</em></p>");
        assertThat(out).contains("<b>Bold</b>");
        assertThat(out).contains("<em>italic</em>");
    }

    @Test
    void returnsEmptyForNullAndBlank() {
        assertThat(sanitizer.sanitize(null)).isEmpty();
        assertThat(sanitizer.sanitize("")).isEmpty();
        assertThat(sanitizer.sanitize("   ")).isEmpty();
    }
}
