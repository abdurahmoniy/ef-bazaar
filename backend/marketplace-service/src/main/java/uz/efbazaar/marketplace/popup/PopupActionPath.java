package uz.efbazaar.marketplace.popup;

import java.util.Set;
import java.util.regex.Pattern;

/** Exact internal destinations only: no URL decoding, redirects, arbitrary queries or fragments. */
final class PopupActionPath {
    private static final Set<String> PATHS = Set.of("/marketplace", "/profile", "/help", "/invite",
            "/notifications", "/marketplace/new", "/blacklist", "/profile?tab=accounts", "/profile?tab=favorites");
    private static final Pattern LISTING = Pattern.compile(
            "/marketplace/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern GUIDE = Pattern.compile("/help/[a-z0-9]+(?:-[a-z0-9]+)*");

    private PopupActionPath() {}

    static boolean allowed(String path) {
        return path != null && (PATHS.contains(path) || LISTING.matcher(path).matches() || GUIDE.matcher(path).matches());
    }
}
