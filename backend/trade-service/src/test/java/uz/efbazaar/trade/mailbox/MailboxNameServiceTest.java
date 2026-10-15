package uz.efbazaar.trade.mailbox;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MailboxNameServiceTest {
    private MailboxRepository repo;
    private MailboxService service;
    private final UUID owner = UUID.randomUUID();
    private final UUID id = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        repo = mock(MailboxRepository.class);
        service = new MailboxService(repo, mock(TradeRepository.class), mock(TradeCrypto.class),
                mock(TradeEventPublisher.class), mock(uz.efbazaar.trade.plan.service.MailboxAccessService.class));
    }

    @Test
    void trimsAndUpdatesOnlyTheCurrentOwnersName() {
        when(repo.updateDisplayNameOwnedBy(id, owner, "Main account")).thenReturn(1);
        service.renameOwnedBy(owner, id, "  Main account  ");
        verify(repo).updateDisplayNameOwnedBy(id, owner, "Main account");
        verifyNoMoreInteractions(repo);
    }

    @Test
    void blankNameClearsStoredName() {
        when(repo.updateDisplayNameOwnedBy(id, owner, null)).thenReturn(1);
        service.renameOwnedBy(owner, id, " \t\n ");
        verify(repo).updateDisplayNameOwnedBy(id, owner, null);
    }

    @Test
    void failedAtomicOwnershipCheckIsNotFound() {
        assertThatThrownBy(() -> service.renameOwnedBy(owner, id, "Main account"))
                .isInstanceOf(EntityNotFoundException.class);
        verify(repo).updateDisplayNameOwnedBy(id, owner, "Main account");
        verifyNoMoreInteractions(repo);
    }

    @Test
    void handingOffMailboxClearsPreviousOwnersName() {
        Mailbox box = namedMailbox();
        box.setOwnerUserId(UUID.randomUUID());
        assertThat(box.getDisplayName()).isNull();
    }

    @Test
    void assigningSameOwnerPreservesName() {
        Mailbox box = namedMailbox();
        box.setOwnerUserId(UUID.fromString(owner.toString()));
        assertThat(box.getDisplayName()).isEqualTo("Main account");
    }

    @Test
    void revokingOwnerClearsName() {
        Mailbox box = namedMailbox();
        service.revokeOwner(id);
        assertThat(box.getDisplayName()).isNull();
    }

    @Test
    void strippingTradeClearsName() {
        Mailbox box = namedMailbox();
        service.stripFromTrade(id);
        assertThat(box.getDisplayName()).isNull();
    }

    @Test
    void adminDetachmentClearsName() {
        Mailbox box = namedMailbox();
        service.detachOwner(UUID.randomUUID(), id);
        assertThat(box.getDisplayName()).isNull();
    }

    @Test
    void adminReassignmentClearsName() {
        Mailbox box = namedMailbox();
        when(repo.save(box)).thenReturn(box);
        service.reassignOwner(UUID.randomUUID(), id, UUID.randomUUID());
        assertThat(box.getDisplayName()).isNull();
    }

    /**
     * Nom egasiniki: egalik uzilganda u ham ketadi.
     *
     * <p>Qoida entity ichida ({@code Mailbox.setOwnerUserId}) turadi, ya'ni
     * uzish ham, adminning qayta biriktirishi ham uni o'tkazib yubormaydi.
     * Aks holda quti keyingi egasiga begona nom bilan borardi.
     */
    @Test
    void losingTheOwnerClearsName() {
        Mailbox box = Mailbox.builder().id(id).ownerUserId(owner).displayName("Main account").build();

        box.setOwnerUserId(null);

        assertThat(box.getDisplayName()).isNull();
    }

    @Test
    void provisioningCredentialsPreservesName() {
        when(repo.applyCredentials(eq(id), any(), any(), any(), any())).thenReturn(1);
        service.markProvisioned(id, null, new byte[]{1}, new byte[12], new byte[16]);
        verify(repo).applyCredentials(eq(id), any(), any(), any(), any());
        verifyNoMoreInteractions(repo);
    }

    private Mailbox namedMailbox() {
        Mailbox box = Mailbox.builder().id(id).ownerUserId(owner).displayName("Main account").build();
        when(repo.findById(id)).thenReturn(Optional.of(box));
        return box;
    }
}
