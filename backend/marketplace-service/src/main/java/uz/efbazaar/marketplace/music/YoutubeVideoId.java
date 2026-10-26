package uz.efbazaar.marketplace.music;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Parse allowlisted URLs locally. Never resolve or fetch an administrator-supplied URL. */
final class YoutubeVideoId {
    private static final Set<String> HOSTS = Set.of("youtube.com", "www.youtube.com",
            "m.youtube.com", "music.youtube.com");
    private static final Pattern VIDEO_ID = Pattern.compile("[A-Za-z0-9_-]{11}");

    private YoutubeVideoId() {}

    static String parse(String value) {
        if (value == null) throw invalid();
        final URI uri;
        try {
            uri = new URI(value.strip());
        } catch (URISyntaxException exception) {
            throw invalid();
        }
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))
                || host == null || uri.getRawUserInfo() != null || uri.getPort() != -1) {
            throw invalid();
        }
        host = host.toLowerCase(Locale.ROOT);
        String path = uri.getRawPath();
        String id = null;
        if (host.equals("youtu.be") && path != null && path.startsWith("/")) {
            id = path.substring(1);
        } else if (HOSTS.contains(host)) {
            if ("/watch".equals(path) && uri.getRawQuery() != null) {
                for (String part : uri.getRawQuery().split("&")) {
                    if (part.startsWith("v=")) {
                        if (id != null) throw invalid();
                        id = part.substring(2);
                    }
                }
            } else if (path != null) {
                for (String prefix : Set.of("/shorts/", "/embed/", "/live/")) {
                    if (path.startsWith(prefix)) id = path.substring(prefix.length());
                }
            }
        }
        if (id == null || !VIDEO_ID.matcher(id).matches()) throw invalid();
        return id;
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "YouTube video havolasi noto'g'ri");
    }
}
