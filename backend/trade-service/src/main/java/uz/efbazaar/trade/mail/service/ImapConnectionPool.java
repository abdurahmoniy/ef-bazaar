package uz.efbazaar.trade.mail.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.mail.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import uz.efbazaar.trade.mail.config.MailProperties;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;

/** Bounded cached IMAPS stores. A lease exclusively owns one mailbox until its folder has closed. */
@Slf4j
@Component
public class ImapConnectionPool {
    private final MailProperties props;
    private final MailboxPasswordResolver passwordResolver;
    private final int maximum;
    private final Semaphore permits;
    private final ReentrantLock[] locks = new ReentrantLock[64];
    private final Map<UUID, Entry> pool = new HashMap<>();
    private ScheduledExecutorService sweeper;

    public ImapConnectionPool(MailProperties props, MailboxPasswordResolver resolver) { this(props,resolver,8); }
    @Autowired
    public ImapConnectionPool(MailProperties props, MailboxPasswordResolver resolver,
                              @Value("${trade.mail.imap.max-connections:8}") int maximum) {
        this.props=props; this.passwordResolver=resolver; this.maximum=Math.max(1,maximum);
        this.permits=new Semaphore(this.maximum,true);
        Arrays.setAll(locks, i -> new ReentrantLock(true));
    }
    @PostConstruct void start() {
        sweeper=Executors.newSingleThreadScheduledExecutor(r->{var t=new Thread(r,"imap-pool-sweeper");t.setDaemon(true);return t;});
        long period=Math.max(1,props.imap().poolSweepSeconds());
        sweeper.scheduleAtFixedRate(this::sweep,period,period,TimeUnit.SECONDS);
    }
    @PreDestroy synchronized void stop() {
        if(sweeper!=null)sweeper.shutdownNow();
        pool.values().forEach(e->closeQuietly(e.store));pool.clear();
    }

    public record Lease(Store store, Runnable release) implements AutoCloseable {
        @Override public void close() { release.run(); }
    }

    public Lease lease(Mailbox mailbox) throws MessagingException {
        ReentrantLock lock=locks[(mailbox.getId().hashCode() & Integer.MAX_VALUE)%locks.length];
        boolean acquired=false, locked=false;
        try {
            acquired=permits.tryAcquire(5,TimeUnit.SECONDS);
            if(!acquired)throw new MessagingException("IMAP capacity busy; retry shortly");
            locked=lock.tryLock(5,TimeUnit.SECONDS);
            if(!locked)throw new MessagingException("Mailbox is busy; retry shortly");
            Entry entry;
            synchronized(this) { entry=acquireExclusive(mailbox);entry.inUse=true; }
            var released=new java.util.concurrent.atomic.AtomicBoolean();
            return new Lease(entry.store,()->{
                if(!released.compareAndSet(false,true))return;
                synchronized(this) {
                    entry.inUse=false;entry.lastTouched=Instant.now().getEpochSecond();
                    if(entry.invalid && pool.remove(mailbox.getId(),entry))closeQuietly(entry.store);
                }
                lock.unlock();permits.release();
            });
        } catch(InterruptedException e) {
            if(locked)lock.unlock();if(acquired)permits.release();
            Thread.currentThread().interrupt();throw new MessagingException("Interrupted waiting for IMAP capacity",e);
        } catch(MessagingException | RuntimeException e) {
            if(locked)lock.unlock();if(acquired)permits.release();throw e;
        }
    }

    private Entry acquireExclusive(Mailbox mailbox) throws MessagingException {
        Entry entry=pool.get(mailbox.getId());long now=Instant.now().getEpochSecond();
        if(entry!=null && !entry.invalid && entry.matches(mailbox) && entry.store.isConnected()
                && now-entry.lastTouched<Math.max(1,props.imap().poolTtlSeconds())) return entry;
        if(entry!=null){pool.remove(mailbox.getId());closeQuietly(entry.store);}
        if(pool.size()>=maximum) {
            var idle=pool.entrySet().stream().filter(e->!e.getValue().inUse)
                    .min(Comparator.comparingLong(e->e.getValue().lastTouched)).orElseThrow(()->new IllegalStateException("IMAP capacity invariant"));
            pool.remove(idle.getKey());closeQuietly(idle.getValue().store);
        }
        Entry fresh=new Entry(openStore(mailbox),now,mailbox);pool.put(mailbox.getId(),fresh);return fresh;
    }

    public synchronized void invalidate(UUID mailboxId) {
        Entry entry=pool.get(mailboxId);if(entry==null)return;
        if(entry.inUse){entry.invalid=true;return;}
        pool.remove(mailboxId);closeQuietly(entry.store);
    }

    protected Store openStore(Mailbox mailbox) throws MessagingException {
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


    private synchronized void sweep() {
        long now=Instant.now().getEpochSecond();
        var iterator=pool.entrySet().iterator();
        while(iterator.hasNext()) {
            var e=iterator.next().getValue();
            if(!e.inUse && (e.invalid || !e.store.isConnected() || now-e.lastTouched>=Math.max(1,props.imap().poolTtlSeconds()))) {
                iterator.remove();closeQuietly(e.store);
            }
        }
    }
    private static void closeQuietly(Store store) {
        try { if(store!=null && store.isConnected())store.close(); } catch(MessagingException ignored) { }
    }
    private static final class Entry {
        final Store store; final String email; final byte[] password, iv, tag;
        long lastTouched; boolean inUse; boolean invalid;
        Entry(Store store,long at,Mailbox mailbox) {
            this.store=store;this.lastTouched=at;this.email=mailbox.getEmail();
            this.password=copy(mailbox.getEncryptedPassword());this.iv=copy(mailbox.getPasswordIv());this.tag=copy(mailbox.getPasswordTag());
        }
        boolean matches(Mailbox mailbox) {
            return Objects.equals(email,mailbox.getEmail()) && Arrays.equals(password,mailbox.getEncryptedPassword())
                    && Arrays.equals(iv,mailbox.getPasswordIv()) && Arrays.equals(tag,mailbox.getPasswordTag());
        }
        private static byte[] copy(byte[] bytes) { return bytes==null?null:bytes.clone(); }
    }
}
