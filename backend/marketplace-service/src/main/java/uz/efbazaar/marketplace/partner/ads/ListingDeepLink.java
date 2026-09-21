package uz.efbazaar.marketplace.partner.ads;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Kanal postidagi ikki havola: matndagi va tugmadagi.
 *
 * <p>Matn ichidagi "efBazaar" havolasi har doim oddiy sayt manzili bo'lib
 * qoladi — postni Telegramdan tashqarida ochgan odam ham e'longa tusha
 * olishi kerak.
 *
 * <p>Tugma esa Mini App'ni Telegram ichida ochadi. U ATAYLAB oddiy
 * {@code url} tugmasi bo'lib qolaveradi: {@code web_app} tugmalari faqat
 * shaxsiy chatda ishlaydi va kanalga shunday tugma bilan yuborilgan
 * xabarni Telegram butunlay rad etadi (bot tarafidagi
 * {@code ChannelPoster} izohiga qarang). Kanaldan Mini App'ni ochadigan
 * yagona yo'l — to'g'ridan-to'g'ri havola:
 * {@code t.me/<bot>/<app>?startapp=<payload>}.
 *
 * <p>Telegram {@code startapp} qiymatiga faqat {@code A-Za-z0-9_-} ni
 * ruxsat beradi, shuning uchun e'lon id si va hamkor kodi pastki chiziq
 * bilan ulanadi: {@code <uuid>_<KOD>}. UUID ichidagi tire ruxsat etilgan,
 * kod esa sakkizta {@code [A-Z0-9]}, ya'ni ajratuvchi bilan to'qnashmaydi.
 * Rasmiy kanalda kod umuman yo'q — u post hech qaysi hamkorga tegishli
 * emas va undan kelgan savdo ulushi ham yo'q.
 *
 * <p>{@code app.telegram.mini-app-url} sozlanmagan bo'lsa tugma eski sayt
 * havolasiga tushadi: Mini App qisqa nomi BotFather'da ochilmagan muhitda
 * tugma o'lik bo'lgandan ko'ra brauzerda ochilgani yaxshi.
 */
@Component
public class ListingDeepLink {

    private final String webBaseUrl;
    private final String miniAppUrl;

    public ListingDeepLink(@Value("${app.web.base-url:https://efbazaar.uz}") String webBaseUrl,
                           @Value("${app.telegram.mini-app-url:}") String miniAppUrl) {
        this.webBaseUrl = trimTrailingSlash(webBaseUrl);
        this.miniAppUrl = trimTrailingSlash(miniAppUrl);
    }

    /** Post matnidagi havola — har doim brauzer uchun. */
    public String webUrl(UUID listingId, String linkCode) {
        String url = webBaseUrl + "/marketplace/" + listingId;
        return blank(linkCode) ? url : url + "?p=" + linkCode.trim();
    }

    /** Tugma havolasi — Mini App sozlangan bo'lsa o'sha, aks holda sayt. */
    public String buttonUrl(UUID listingId, String linkCode) {
        if (miniAppUrl.isEmpty()) {
            return webUrl(listingId, linkCode);
        }
        String payload = blank(linkCode)
                ? listingId.toString()
                : listingId + "_" + linkCode.trim();
        return miniAppUrl + "?startapp=" + payload;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static String trimTrailingSlash(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }
}
