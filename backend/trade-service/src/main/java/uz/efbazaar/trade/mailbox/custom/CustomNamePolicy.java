package uz.efbazaar.trade.mailbox.custom;

import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * What a self-named mailbox may be called.
 *
 * <p>Stricter than the admin form on purpose: 5–24 lowercase letters and
 * digits, nothing else, so a name is easy to read out and type into Konami.
 * Reserved names would let somebody pose as the platform.
 */
public final class CustomNamePolicy {

    public enum NameProblem { INVALID, RESERVED }

    private static final Pattern FORMAT = Pattern.compile("^[a-z0-9]{5,24}$");

    private static final Set<String> RESERVED = Set.of(
            "admin", "administrator", "support", "postmaster", "abuse", "noreply",
            "hostmaster", "webmaster", "root", "info", "mail", "efbazaar", "efootball",
            "konami", "trade", "pending", "help", "security", "billing");

    private CustomNamePolicy() {}

    public static String normalize(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    /** Checks an already normalized local part. */
    public static Optional<NameProblem> check(String localPart) {
        if (localPart == null || !FORMAT.matcher(localPart).matches()) return Optional.of(NameProblem.INVALID);
        if (RESERVED.contains(localPart)) return Optional.of(NameProblem.RESERVED);
        return Optional.empty();
    }
}
