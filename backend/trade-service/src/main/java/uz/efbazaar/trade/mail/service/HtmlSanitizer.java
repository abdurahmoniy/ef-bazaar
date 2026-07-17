package uz.efbazaar.trade.mail.service;

import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;
import org.springframework.stereotype.Component;

/**
 * Jsoup-backed HTML sanitiser for message bodies. Whitelist-based — anything
 * not on the safelist is dropped.
 *
 * <p>Blocks:
 * <ul>
 *   <li>{@code <script>}, {@code <iframe>}, {@code <object>}, {@code <embed>},
 *       {@code <style>} (removed outright)</li>
 *   <li>All {@code on*} attributes (onclick, onload, …)</li>
 *   <li>External images — {@code <img>} tags are stripped entirely so the
 *       message can't be used as a tracking pixel back to a third party. When
 *       the feature grows we may add lazy-load-with-warning; for MVP we just
 *       drop them.</li>
 *   <li>{@code style} attributes (allowed by Jsoup's relaxed safelist, but we
 *       remove them so CSS-based data-exfil / phishing tricks can't run).</li>
 *   <li>{@code javascript:} / {@code data:} URLs on links (Safelist enforces
 *       an http/https/mailto scheme allowlist).</li>
 * </ul>
 */
@Component
public class HtmlSanitizer {

    /**
     * Safelist is built once at construction — Jsoup safelists are immutable
     * after use in {@code Cleaner}.
     */
    private final Safelist safelist;

    public HtmlSanitizer() {
        this.safelist = Safelist.relaxed()
                .removeTags("img", "style")
                .removeAttributes(":all", "style", "class", "id");
        // Force target=_blank + rel=noopener on any preserved link so a
        // malicious href can't reach window.opener.
        this.safelist.addAttributes("a", "target");
        this.safelist.addAttributes("a", "rel");
        this.safelist.addProtocols("a", "href", "http", "https", "mailto");
    }

    /**
     * @param dirty raw HTML from an email body
     * @return sanitised HTML fragment (never null; empty string if input was blank)
     */
    public String sanitize(String dirty) {
        if (dirty == null || dirty.isBlank()) return "";
        String cleaned = Jsoup.clean(dirty, safelist);
        // Post-process: force safe link targets on every remaining <a>.
        org.jsoup.nodes.Document doc = Jsoup.parseBodyFragment(cleaned);
        doc.select("a[href]").forEach(a -> {
            a.attr("target", "_blank");
            a.attr("rel", "noopener noreferrer");
        });
        return doc.body().html();
    }
}
