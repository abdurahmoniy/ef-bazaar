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
    private MailboxService svc;

    private final Pageable page = PageRequest.of(0, 20);

    @BeforeEach
    void setUp() {
        repo = mock(MailboxRepository.class);
        svc = new MailboxService(repo, mock(TradeRepository.class), mock(TradeCrypto.class),
                mock(uz.efbazaar.trade.kafka.TradeEventPublisher.class));
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
}
