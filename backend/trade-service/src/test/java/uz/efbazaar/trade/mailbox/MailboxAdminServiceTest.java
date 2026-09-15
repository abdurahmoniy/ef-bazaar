package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.domain.MailboxSource;
import uz.efbazaar.trade.mailbox.exception.MailboxAlreadyExistsException;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Admin-panel behaviour of MailboxService — no DB, no IMAP. */
class MailboxAdminServiceTest {

    private MailboxRepository repo;
    private uz.efbazaar.trade.kafka.TradeEventPublisher events;
    private TradeRepository trades;
    private MailboxService svc;

    private final Pageable page = PageRequest.of(0, 20);

    @BeforeEach
    void setUp() {
        repo = mock(MailboxRepository.class);
        events = mock(uz.efbazaar.trade.kafka.TradeEventPublisher.class);
        trades = mock(TradeRepository.class);
        svc = new MailboxService(repo, trades, mock(TradeCrypto.class), events);
    }

    @Test
    void createPendingForAdminLinksOwnerAndLeavesRowUnprovisioned() {
        when(repo.existsByEmail("azizbek@efbazaar.uz")).thenReturn(false);
        when(repo.save(any(Mailbox.class))).thenAnswer(inv -> inv.getArgument(0));

        UUID owner = UUID.randomUUID();
        UUID admin = UUID.randomUUID();
        Mailbox created = svc.createPendingForAdmin("azizbek@efbazaar.uz", owner, admin);

        assertThat(created.getEmail()).isEqualTo("azizbek@efbazaar.uz");
        assertThat(created.getOwnerUserId()).isEqualTo(owner);
        assertThat(created.getCreatedByAdminId()).isEqualTo(admin);
        assertThat(created.getSource()).isEqualTo(MailboxSource.ADMIN);
        assertThat(created.getTradeId()).isNull();
        // Until the worker answers there are no real credentials — the panel
        // renders this as "kutilmoqda" and the inbox endpoint short-circuits.
        assertThat(created.getProvisionedAt()).isNull();
    }

    @Test
    void createPendingForAdminRejectsTakenAddress() {
        when(repo.existsByEmail("azizbek@efbazaar.uz")).thenReturn(true);

        assertThatThrownBy(() ->
                svc.createPendingForAdmin("azizbek@efbazaar.uz", UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(MailboxAlreadyExistsException.class);
        verify(repo, never()).save(any());
    }

    @Test
    void markProvisionedStoresCredentialsAndStampsTime() {
        UUID id = UUID.randomUUID();
        Mailbox pending = Mailbox.builder()
                .id(id)
                .email("pending@efbazaar.uz")
                .encryptedPassword(new byte[]{0})
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .build();
        when(repo.findById(id)).thenReturn(Optional.of(pending));

        svc.markProvisioned(id, "azizbek@efbazaar.uz", new byte[]{1, 2}, new byte[12], new byte[16]);

        var saved = forClass(Mailbox.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getEmail()).isEqualTo("azizbek@efbazaar.uz");
        assertThat(saved.getValue().getEncryptedPassword()).containsExactly(1, 2);
        assertThat(saved.getValue().getProvisionedAt()).isNotNull();
    }

    @Test
    void searchForAdminAlwaysGoesThroughASpecification() {
        when(repo.findAll(ArgumentMatchers.<Specification<Mailbox>>any(), eq(page)))
                .thenReturn(Page.empty());

        svc.searchForAdmin(null, null, null, false, false, page);
        svc.searchForAdmin("kona", UUID.randomUUID(), MailboxSource.ADMIN, true, true, page);

        verify(repo, times(2)).findAll(ArgumentMatchers.<Specification<Mailbox>>any(), eq(page));
    }

    @Test
    void statsForAdminReportsEveryCounter() {
        when(repo.count()).thenReturn(7L);
        when(repo.countBySource(MailboxSource.TRADE)).thenReturn(5L);
        when(repo.countBySource(MailboxSource.ADMIN)).thenReturn(2L);
        when(repo.countByProvisionedAtIsNull()).thenReturn(1L);
        when(repo.countByOwnerUserIdIsNull()).thenReturn(3L);

        var stats = svc.statsForAdmin();

        assertThat(stats.total()).isEqualTo(7);
        assertThat(stats.trade()).isEqualTo(5);
        assertThat(stats.admin()).isEqualTo(2);
        assertThat(stats.pending()).isEqualTo(1);
        assertThat(stats.unassigned()).isEqualTo(3);
    }

    private Mailbox unheld(java.time.Instant provisionedAt) {
        return Mailbox.builder()
                .id(java.util.UUID.randomUUID())
                .email("box@efbazaar.uz")
                .provisionedAt(provisionedAt)
                .build();
    }

    /**
     * A mailbox that was reserved and never created has nothing to remove.
     *
     * <p>Seen in production: the worker was asked to delete a "pending-…"
     * address, Mailcow answered access_denied — which is what it says for a
     * mailbox that does not exist, not object_dne — and the request went round
     * Kafka firing the same Telegram alert on every pass. Three arrived inside
     * a minute.
     */
    @Test
    void deletingAnUnprovisionedMailboxAsksTheWorkerForNothing() {
        Mailbox box = unheld(null);
        when(repo.findById(box.getId())).thenReturn(java.util.Optional.of(box));

        svc.deleteUnheld(box.getId());

        org.mockito.Mockito.verify(events, org.mockito.Mockito.never())
                .mailboxDeleteRequest(any(), any());
        org.assertj.core.api.Assertions.assertThat(box.getDeletedAt())
                .as("still marked deleted on our side")
                .isNotNull();
    }

    @Test
    void deletingARealMailboxDoesAskTheWorker() {
        Mailbox box = unheld(java.time.Instant.now());
        when(repo.findById(box.getId())).thenReturn(java.util.Optional.of(box));

        svc.deleteUnheld(box.getId());

        org.mockito.Mockito.verify(events).mailboxDeleteRequest(box.getId(), "box@efbazaar.uz");
    }

    // ---------- detach / reassign ----------

    private Mailbox ownedBox(UUID owner, boolean provisioned) {
        Mailbox m = Mailbox.builder()
                .id(UUID.randomUUID())
                .email("box@efbazaar.uz")
                .ownerUserId(owner)
                .encryptedPassword(new byte[]{1})
                .passwordIv(new byte[12])
                .passwordTag(new byte[16])
                .provisionedAt(provisioned ? java.time.Instant.now() : null)
                .build();
        when(repo.findById(m.getId())).thenReturn(Optional.of(m));
        when(repo.save(any(Mailbox.class))).thenAnswer(inv -> inv.getArgument(0));
        when(trades.existsLiveWithMailbox(eq(m.getId()), any())).thenReturn(false);
        return m;
    }

    @Test
    void detachingDropsTheOwnerAndRotatesThePassword() {
        Mailbox m = ownedBox(UUID.randomUUID(), true);

        svc.detachOwner(UUID.randomUUID(), m.getId());

        assertThat(m.getOwnerUserId()).isNull();
        assertThat(m.getHandedOffAt()).as("nothing was handed to anyone").isNull();
        verify(events).mailboxRotateRequest(m.getId(), "box@efbazaar.uz");
    }

    @Test
    void reassigningMovesTheBoxStampsTheHandoffAndRotates() {
        Mailbox m = ownedBox(UUID.randomUUID(), true);
        UUID next = UUID.randomUUID();

        svc.reassignOwner(UUID.randomUUID(), m.getId(), next);

        assertThat(m.getOwnerUserId()).isEqualTo(next);
        assertThat(m.getHandedOffAt()).isNotNull();
        verify(events).mailboxRotateRequest(m.getId(), "box@efbazaar.uz");
    }

    /** Mailcow has not created it yet — there is no password to rotate, and asking would fail. */
    @Test
    void aPendingBoxChangesHandsWithoutARotation() {
        Mailbox m = ownedBox(null, false);

        svc.reassignOwner(UUID.randomUUID(), m.getId(), UUID.randomUUID());

        verify(events, never()).mailboxRotateRequest(any(), any());
    }

    @Test
    void aBoxInALiveTradeIsNotMoved() {
        Mailbox m = ownedBox(UUID.randomUUID(), true);
        when(trades.existsLiveWithMailbox(eq(m.getId()), any())).thenReturn(true);

        assertThatThrownBy(() -> svc.detachOwner(UUID.randomUUID(), m.getId()))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> svc.reassignOwner(UUID.randomUUID(), m.getId(), UUID.randomUUID()))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verify(repo, never()).save(any());
        verify(events, never()).mailboxRotateRequest(any(), any());
    }

    @Test
    void pointlessChangesAreRefused() {
        UUID owner = UUID.randomUUID();
        Mailbox owned = ownedBox(owner, true);
        Mailbox free = ownedBox(null, true);

        assertThatThrownBy(() -> svc.reassignOwner(UUID.randomUUID(), owned.getId(), owner))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(() -> svc.detachOwner(UUID.randomUUID(), free.getId()))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verify(events, never()).mailboxRotateRequest(any(), any());
    }

    @Test
    void aDeletedBoxCannotBeGivenToAnyone() {
        Mailbox m = ownedBox(null, true);
        m.setDeletedAt(java.time.Instant.now());

        assertThatThrownBy(() -> svc.reassignOwner(UUID.randomUUID(), m.getId(), UUID.randomUUID()))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
