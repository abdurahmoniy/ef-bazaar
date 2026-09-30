package uz.efbazaar.outbox.internal;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.OutboxProperties;
import uz.efbazaar.outbox.SnapshotSource;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * outbox_events va snapshot belgilarini Kafka'ga yetkazadi.
 *
 * <p>Zaxira polling {@code outbox.relay.poll-interval} bo'yicha o'z rejalashtiruvchisida
 * ({@code @Scheduled} emas: u "500ms" kabi Boot Duration formatini tushunmaydi).
 *
 * <p>Hammasi bitta ishchi ipda: commit'dagi uyg'otish ham, zaxira polling ham shu ipga
 * navbat qo'yadi, shuning uchun bir instansiya ichida ikki partiya parallel yurmaydi.
 * Instansiyalar orasini FOR UPDATE SKIP LOCKED ajratadi.
 */
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxRepository repo;
    private final OutboxSender sender;
    private final TransactionTemplate tx;
    private final TransactionTemplate readOnlyTx;
    private final OutboxProperties props;
    private final Map<String, SnapshotSource> sources;
    private final MessageEncoder encoder;
    private final Counter failures;
    private final Counter parked;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "outbox-relay");
        t.setDaemon(true);
        return t;
    });
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "outbox-relay-poller");
        t.setDaemon(true);
        return t;
    });
    private final AtomicBoolean queued = new AtomicBoolean();

    public OutboxRelay(OutboxRepository repo, OutboxSender sender, TransactionTemplate tx,
                       OutboxProperties props, List<SnapshotSource> sources, MessageEncoder encoder,
                       MeterRegistry registry) {
        this.repo = repo;
        this.sender = sender;
        this.tx = tx;
        this.readOnlyTx = new TransactionTemplate(java.util.Objects.requireNonNull(tx.getTransactionManager()));
        this.readOnlyTx.setReadOnly(true);
        this.props = props;
        this.sources = sources.stream().collect(Collectors.toMap(SnapshotSource::source, Function.identity()));
        this.encoder = encoder;
        this.failures = Counter.builder("outbox.send.failures").register(registry);
        this.parked = Counter.builder("outbox.parked").register(registry);
    }

    /** Commit'dan keyin chaqiriladi; navbatda turgan partiya bo'lsa ikkinchisini qo'shmaydi. */
    public void wake() {
        if (queued.compareAndSet(false, true)) {
            worker.execute(() -> {
                queued.set(false);
                drain();
            });
        }
    }

    /** Zaxira pollingni boshlaydi (bean init). */
    public void start() {
        long interval = props.getRelay().getPollInterval().toMillis();
        poller.scheduleWithFixedDelay(this::wake, interval, interval, TimeUnit.MILLISECONDS);
    }

    /**
     * Relay ishchi ipida navbatni bo'shatadi va tugashini kutadi (testlar va qo'lda chaqiruv uchun).
     * Barcha drain'lar bitta ipda ketma-ket — bir instansiya ichida bir yozuv ikki marta yuborilmaydi.
     */
    public void drainNow() {
        try {
            worker.submit(this::drain).get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (java.util.concurrent.ExecutionException e) {
            log.warn("outbox relay drainNow yiqildi: {}", e.getCause().toString());
        }
    }

    /** Navbat bo'shaguncha yoki birinchi xatogacha. Hech qachon exception tashlamaydi. */
    private void drain() {
        try {
            while (true) {
                BatchResult events = sendEventBatch();
                BatchResult snapshots = sendSnapshotBatch();
                if (events.failed() || snapshots.failed() || (events.sent() == 0 && snapshots.sent() == 0)) {
                    return;
                }
            }
        } catch (RuntimeException e) {
            failures.increment();
            log.warn("outbox relay aylanishi yiqildi, keyingi aylanishda qayta: {}", e.toString());
        }
    }

    public boolean pendingIsEmpty() {
        return repo.pendingCount() == 0;
    }

    public void shutdown() {
        poller.shutdownNow();
        worker.shutdownNow();
    }

    private BatchResult sendEventBatch() {
        BatchResult result = tx.execute(status -> {
            List<OutboxRow> rows = repo.claimEvents(props.getRelay().getBatchSize());
            if (rows.isEmpty()) {
                return BatchResult.EMPTY;
            }
            List<CompletableFuture<?>> futures = new ArrayList<>(rows.size());
            for (OutboxRow row : rows) {
                CompletableFuture<?> future = sendSafely(row.topic(), row.key(), row.payload(), row.headersJson());
                futures.add(future);
                if (future.isCompletedExceptionally() && !PermanentFailures.isPermanent(failureOf(future))) {
                    // send() sinxron yiqildi (broker yo'q, max.block.ms tugadi) — qolganlarini
                    // yuborish ham har biri shuncha bloklanadi va qulflarni ushlab turadi.
                    break;
                }
            }
            List<Long> sent = new ArrayList<>();
            for (int i = 0; i < futures.size(); i++) {
                Throwable failure = awaitFailure(futures.get(i));
                if (failure != null && PermanentFailures.isPermanent(failure)) {
                    // Qayta urinish foydasiz — navbatdan chiqaramiz, qolganlari davom etadi.
                    parked.increment();
                    log.error("outbox: yozuv {} ({}) Kafka tomonidan doimiy rad etildi va park qilindi: {}",
                            rows.get(i).id(), rows.get(i).topic(), describe(failure));
                    repo.markParked(rows.get(i).id(), describe(failure));
                    continue;
                }
                if (failure != null) {
                    String error = describe(failure);
                    repo.markPublished(sent);
                    repo.markFailed(rows.get(i).id(), error);
                    return new BatchResult(sent.size(), true, error);
                }
                sent.add(rows.get(i).id());
            }
            repo.markPublished(sent);
            return new BatchResult(sent.size(), false, null);
        });
        if (result != null && result.failed()) {
            failures.increment();
            log.warn("outbox: yuborish yiqildi, yozuv navbatda qoldi: {}", result.error());
        }
        return result == null ? BatchResult.EMPTY : result;
    }

    /**
     * Snapshot'lar TRANZAKSIYASIZ: belgilar qulfsiz o'qiladi, har biri o'z qisqa read-only
     * tranzaksiyasida quriladi, yuboriladi va faqat relay ko'rgan belgi o'chiriladi.
     * Bir nechta relay instansiyasi bir snapshot'ni ikki marta yuborishi mumkin — ikkalasi ham
     * hozirgi holat, version'lari farqli; consumer uchun zararsiz.
     */
    private BatchResult sendSnapshotBatch() {
        List<SnapshotMark> marks = repo.pendingSnapshots(props.getRelay().getBatchSize());
        int sent = 0;
        for (SnapshotMark mark : marks) {
            SnapshotSource source = sources.get(mark.source());
            if (source == null) {
                log.warn("outbox: '{}' uchun SnapshotSource yo'q, belgi tashlab yuborildi", mark.source());
                repo.deleteSnapshot(mark);
                continue;
            }
            long version = repo.nextSnapshotVersion();
            java.util.Optional<Object> payload = readOnlyTx.execute(status -> source.build(mark.entityId(), version));
            if (payload == null || payload.isEmpty()) {
                repo.deleteSnapshot(mark);
                continue;
            }
            EncodedMessage message = encoder.encode(source.topic(), payload.get());
            Throwable failure = awaitFailure(sendSafely(source.topic(), source.key(mark.entityId()),
                    message.payload(), message.headersJson()));
            if (failure != null && PermanentFailures.isPermanent(failure)) {
                // Snapshot'ni park qilib bo'lmaydi (payload saqlanmaydi) — belgi tashlanadi,
                // holat keyingi o'zgarishda yoki replay orqali qayta yuboriladi.
                parked.increment();
                log.error("outbox: snapshot {}:{} Kafka tomonidan doimiy rad etildi, belgi tashlandi: {}",
                        mark.source(), mark.entityId(), describe(failure));
                repo.deleteSnapshot(mark);
                continue;
            }
            String error = failure == null ? null : describe(failure);
            if (error != null) {
                failures.increment();
                log.warn("outbox: snapshot yuborilmadi, belgi navbatda qoldi: {}", error);
                return new BatchResult(sent, true, error);
            }
            repo.deleteSnapshot(mark);
            sent++;
        }
        return new BatchResult(sent, false, null);
    }

    private CompletableFuture<?> sendSafely(String topic, String key, byte[] payload, String headersJson) {
        try {
            return sender.send(topic, key, payload, HeaderCodec.fromJson(headersJson));
        } catch (RuntimeException e) {
            return CompletableFuture.failedFuture(e);
        }
    }

    /** null — muvaffaqiyat; aks holda xato matni. */
    private String await(CompletableFuture<?> future) {
        Throwable failure = awaitFailure(future);
        return failure == null ? null : describe(failure);
    }

    /** null — muvaffaqiyat; aks holda xatoning o'zi (send-timeout tugashi ham xato). */
    private Throwable awaitFailure(CompletableFuture<?> future) {
        try {
            future.get(props.getRelay().getSendTimeout().toMillis(), TimeUnit.MILLISECONDS);
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return e;
        } catch (java.util.concurrent.ExecutionException e) {
            return e.getCause() == null ? e : e.getCause();
        } catch (Exception e) {
            return e;
        }
    }

    private static Throwable failureOf(CompletableFuture<?> done) {
        try {
            done.getNow(null);
            return null;
        } catch (java.util.concurrent.CompletionException e) {
            return e.getCause() == null ? e : e.getCause();
        } catch (RuntimeException e) {
            return e;
        }
    }

    private static String describe(Throwable failure) {
        Throwable root = failure;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getClass().getSimpleName() + ": " + root.getMessage();
    }

    record BatchResult(int sent, boolean failed, String error) {
        static final BatchResult EMPTY = new BatchResult(0, false, null);
    }
}
