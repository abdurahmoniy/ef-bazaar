package uz.efbazaar.trade.mailbox;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class OwnerMailboxDetachTest {
    private final UUID owner = UUID.randomUUID();
    private final MailboxRepository repo = mock(MailboxRepository.class);
    private final TradeRepository trades = mock(TradeRepository.class);
    private final TradeEventPublisher events = mock(TradeEventPublisher.class);
    private final MailboxService service = new MailboxService(repo, trades, mock(TradeCrypto.class), events,
                mock(uz.efbazaar.trade.plan.service.MailboxAccessService.class),
                mock(uz.efbazaar.trade.mailbox.link.LinkSessionService.class));
    private Mailbox box;

    @BeforeEach
    void setUp() {
        box = Mailbox.builder().id(UUID.randomUUID()).email("box@efbazaar.uz")
                .ownerUserId(owner).displayName("My account").provisionedAt(Instant.now()).build();
        when(repo.findByIdAndOwnerUserId(box.getId(), owner)).thenReturn(Optional.of(box));
        when(repo.detachOwnedBy(box.getId(), owner)).thenReturn(1);
    }

    @Test
    void detachesWithoutDeletingAndRotatesPassword() {
        service.detachOwnedBy(owner, box.getId());
        verify(repo).detachOwnedBy(box.getId(), owner);
        verify(events).mailboxRotateRequest(box.getId(), box.getEmail());
        verify(events, never()).mailboxDeleteRequest(any(), any());
    }

    @Test
    void strangerCannotDetachOrLearnTradeStatus() {
        assertThatThrownBy(() -> service.detachOwnedBy(UUID.randomUUID(), box.getId()))
                .isInstanceOf(EntityNotFoundException.class);
        verifyNoInteractions(trades, events);
        verify(repo, never()).detachOwnedBy(any(), any());
    }

    @Test
    void refusesLiveTrade() {
        when(trades.existsLiveWithMailbox(eq(box.getId()), any())).thenReturn(true);
        assertThatThrownBy(() -> service.detachOwnedBy(owner, box.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value()).isEqualTo(409);
        verify(repo, never()).detachOwnedBy(any(), any());
        verifyNoInteractions(events);
    }

    @Test
    void refusesDeletedMailbox() {
        box.setDeletedAt(Instant.now());
        assertThatThrownBy(() -> service.detachOwnedBy(owner, box.getId()))
                .isInstanceOf(EntityNotFoundException.class);
        verify(repo, never()).detachOwnedBy(any(), any());
        verifyNoInteractions(events);
    }

    @Test
    void closedTradeReferenceDoesNotBlockDetachment() {
        box.setTradeId(UUID.randomUUID());
        service.detachOwnedBy(owner, box.getId());
        verify(repo).detachOwnedBy(box.getId(), owner);
    }

    @Test
    void concurrentOwnershipChangeDoesNotRotateAnotherOwnersPassword() {
        when(repo.detachOwnedBy(box.getId(), owner)).thenReturn(0);
        assertThatThrownBy(() -> service.detachOwnedBy(owner, box.getId()))
                .isInstanceOf(EntityNotFoundException.class);
        verifyNoInteractions(events);
    }

    @Test
    void unprovisionedMailboxNeedsNoPasswordRotation() {
        box.setProvisionedAt(null);
        service.detachOwnedBy(owner, box.getId());
        verify(repo).detachOwnedBy(box.getId(), owner);
        verifyNoInteractions(events);
    }
}
