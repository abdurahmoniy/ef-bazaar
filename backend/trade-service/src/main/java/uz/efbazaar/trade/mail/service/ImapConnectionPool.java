package uz.efbazaar.trade.mail.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.mail.MessagingException;
import jakarta.mail.NoSuchProviderException;
import jakarta.mail.Session;
import jakarta.mail.Store;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.mail.config.MailProperties;
import uz.efbazaar.trade.mailbox.domain.Mailbox;

import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * TTL-cached IMAPS connection pool keyed by mailbox id.
 *
 * <p>IMAPS opens are expensive (TLS handshake + LOGIN roundtrip). The Gmail-
 * style UI polls every 30s, and the sidebar unread-count aggregates across
 * every owned mailbox — a fresh connection per request would saturate dovecot
 * within a couple of buyers.
 *
 * <p>Entries evict after the TTL from application.yml
 * ({@code trade.mail.imap.pool-ttl-seconds}, 5 min default) OR when they're
 * observed to be disconnected. A background sweeper (default 60s cadence)
 * closes and drops expired entries so we don't hold idle sockets forever.
 *
 * <p>{@link MailService} is expected to serialise access per mailbox — a
 * single {@link Store} isn't reentrant for interleaved folder operations.
 * For the current call sites (one folder-open per request) that's fine.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ImapConnectionPool {

    private final MailProperties props;
    private final MailboxPasswordResolver passwordResolver;

    private final ConcurrentHashMap<UUID, Entry> pool = new ConcurrentHashMap<>();
    private ScheduledExecutorService sweeper;

    @PostConstruct
    void start() {
        sweeper = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "imap-pool-sweeper");
            t.setDaemon(true);
            return t;
        });
        long period = Math.max(1L, props.imap().poolSweepSeconds());
        sweeper.scheduleAtFixedRate(this::sweep, period, period, TimeUnit.SECONDS);
    }

    @PreDestroy
    void stop() {
        if (sweeper != null) sweeper.shutdownNow();
        for (Entry e : pool.values()) closeQuietly(e.store);
        pool.clear();
    }

    /**
     * Acquire an open IMAPS {@link Store} for the given mailbox. Callers MUST
     * NOT close the store — the pool owns its lifecycle. If the cached
     * connection is dead we transparently reconnect.
     */
    public Store acquire(Mailbox mailbox) throws MessagingException {
        Entry existing = pool.get(mailbox.getId());
        if (existing != null && existing.store.isConnected() && !existing.isExpired(nowSeconds())) {
            existing.touch();
            return existing.store;
        }
        if (existing != null) {
            closeQuietly(existing.store);
            pool.remove(mailbox.getId(), existing);
        }
        Store fresh = openStore(mailbox);
        pool.put(mailbox.getId(), new Entry(fresh, nowSeconds(), ttlSeconds()));
        return fresh;
    }

    /**
     * Drop the cached connection for a mailbox (used when a caller detects the
     * store is unusable — e.g. FolderClosedException from an idle timeout).
     * Future acquires will reconnect.
     */
    public void invalidate(UUID mailboxId) {
        Entry e = pool.remove(mailboxId);
        if (e != null) closeQuietly(e.store);
    }

    private Store openStore(Mailbox mailbox) throws MessagingException {
        Properties p = new Properties();
        p.put("mail.store.protocol", "imaps");
        p.put("mail.imaps.host", props.imap().host());
        p.put("mail.imaps.port", String.valueOf(props.imap().port()));
        p.put("mail.imaps.ssl.enable", "true");
        p.put("mail.imaps.ssl.checkserveridentity", "true");
        p.put("mail.imaps.connectiontimeout", String.valueOf(props.imap().connectionTimeoutMs()));
        p.put("mail.imaps.timeout", String.valueOf(props.imap().readTimeoutMs()));
        // Angus keeps stores open across folder cycles; we rely on that behaviour
        // for the pool to be worth anything.
        p.put("mail.imaps.usesocketchannels", "true");

        Session session = Session.getInstance(p);
        Store store;
        try {
            store = session.getStore("imaps");
        } catch (NoSuchProviderException e) {
            throw new IllegalStateException("No IMAPS provider on classpath — is angus-mail wired in?", e);
        }
        byte[] password = passwordResolver.decryptPassword(mailbox);
        try {
            store.connect(props.imap().host(), props.imap().port(),
                    mailbox.getEmail(), new String(password));
        } finally {
            // Best-effort scrubbing of the plaintext buffer once handed to Store.
            java.util.Arrays.fill(password, (byte) 0);
        }
        log.debug("Opened IMAPS store for mailbox {} ({})", mailbox.getId(), mailbox.getEmail());
        return store;
    }

    private void sweep() {
        long now = nowSeconds();
        Iterator<Map.Entry<UUID, Entry>> it = pool.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<UUID, Entry> e = it.next();
            Entry entry = e.getValue();
            if (entry.isExpired(now) || !entry.store.isConnected()) {
                closeQuietly(entry.store);
                it.remove();
            }
        }
    }

    private long ttlSeconds() { return Math.max(1L, props.imap().poolTtlSeconds()); }
    private long nowSeconds() { return Instant.now().getEpochSecond(); }

    private static void closeQuietly(Store store) {
        try {
            if (store != null && store.isConnected()) store.close();
        } catch (MessagingException e) {
            // Nothing sensible to do; pool is disposing this entry regardless.
        }
    }

    private static final class Entry {
        final Store store;
        long lastTouchedSeconds;
        final long ttlSeconds;

        Entry(Store store, long now, long ttlSeconds) {
            this.store = store;
            this.lastTouchedSeconds = now;
            this.ttlSeconds = ttlSeconds;
        }

        boolean isExpired(long nowSeconds) {
            return nowSeconds - lastTouchedSeconds >= ttlSeconds;
        }

        void touch() {
            this.lastTouchedSeconds = Instant.now().getEpochSecond();
        }
    }
}
