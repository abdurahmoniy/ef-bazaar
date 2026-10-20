package uz.efbazaar.trade.mailbox.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Mail domains this deployment hands out.
 *
 * <p>The first is the default — trade boxes and anything that does not ask
 * live there. Every other domain is premium: only plans listed in
 * {@code trade.mailbox.premium-domain-plans} may claim a custom box on it.
 * Each domain must also exist in Mailcow, or the worker cannot create boxes.
 */
@Component
public class MailboxDomains {

    private final List<String> all;
    private final Set<String> premiumPlans;

    public MailboxDomains(@Value("${trade.mailbox.domains:efbazaar.uz}") String domains,
                          @Value("${trade.mailbox.premium-domain-plans:PRO,STAFF}") String plans) {
        List<String> parsed = Arrays.stream(domains.split(","))
                .map(s -> s.trim().toLowerCase(Locale.ROOT))
                .filter(s -> !s.isEmpty())
                .distinct()
                .toList();
        this.all = parsed.isEmpty() ? List.of("efbazaar.uz") : parsed;
        this.premiumPlans = Arrays.stream(plans.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    public List<String> all() {
        return all;
    }

    public String defaultDomain() {
        return all.get(0);
    }

    public boolean allowed(String domain) {
        return domain != null && all.contains(domain.toLowerCase(Locale.ROOT));
    }

    public boolean premium(String domain) {
        return allowed(domain) && !defaultDomain().equals(domain.toLowerCase(Locale.ROOT));
    }

    public Set<String> premiumPlans() {
        return premiumPlans;
    }
}
