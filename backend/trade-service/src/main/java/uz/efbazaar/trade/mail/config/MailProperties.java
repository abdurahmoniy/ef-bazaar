package uz.efbazaar.trade.mail.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Config for the read-only webmail feature. Bound from {@code trade.mail.*} in
 * application.yml. Defaults line up with smart-admin-worker so both processes
 * hit the same dovecot-mailcow instance in every environment.
 */
@ConfigurationProperties(prefix = "trade.mail")
public record MailProperties(
        Imap imap,
        RateLimit rateLimit
) {
    public record Imap(
            String host,
            int port,
            int connectionTimeoutMs,
            int readTimeoutMs,
            long poolTtlSeconds,
            long poolSweepSeconds
    ) {}

    public record RateLimit(
            int perUserPerSecond
    ) {}
}
