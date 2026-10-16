package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.kafka.AccountEmailVerifiedDto;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * trade-service proved the Konami account is on the box: the account gets the
 * address and the verified mark, custom boxes also the CUSTOM source.
 */
@ExtendWith(MockitoExtension.class)
class AccountEmailVerifiedTest {

    @Mock UserAccountRepository accounts;
    @Mock UserAccountCardInventory inventory;
    @Mock ListingRepository listings;
    @Mock PendingAccountEmailRepository pendingEmails;
    @Mock AccountEmailUnlinks unlinks;
    @InjectMocks ListingAccountLink link;

    private final UUID owner = UUID.randomUUID();
    private final UUID mailbox = UUID.randomUUID();

    private UserAccount account(String email, EmailSource source, UUID mailboxId) {
        return UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(owner).status(UserAccountStatus.ACTIVE)
                .email(email).emailSource(source).mailboxId(mailboxId)
                .attributes(new HashMap<>()).mediaMessageIds(new ArrayList<>())
                .build();
    }

    private AccountEmailVerifiedDto event(UserAccount a, boolean custom) {
        return new AccountEmailVerifiedDto(UUID.randomUUID(), a.getId(), owner, mailbox,
                "alibek1@efbazaar.uz", custom, Instant.now());
    }

    private void found(UserAccount a) {
        when(accounts.findByIdForUpdate(a.getId())).thenReturn(Optional.of(a));
        lenient().when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));
    }

    @Test
    void customBoxWritesEmailSourceMailboxAndVerified() {
        UserAccount a = account(null, null, null);
        found(a);

        link.applyVerifiedEmail(event(a, true));

        assertThat(a.getEmail()).isEqualTo("alibek1@efbazaar.uz");
        assertThat(a.getEmailSource()).isEqualTo(EmailSource.CUSTOM);
        assertThat(a.getMailboxId()).isEqualTo(mailbox);
        assertThat(a.isEmailVerified()).isTrue();
    }

    @Test
    void randomBoxKeepsPlatformSource() {
        UserAccount a = account("alibek1@efbazaar.uz", EmailSource.MANUAL, null);
        found(a);

        link.applyVerifiedEmail(event(a, false));

        assertThat(a.getEmailSource()).isEqualTo(EmailSource.PLATFORM);
        assertThat(a.isEmailVerified()).isTrue();
    }

    @Test
    void reportsTheCustomBoxItReplaced() {
        UUID oldBox = UUID.randomUUID();
        UserAccount a = account("old12@efbazaar.uz", EmailSource.CUSTOM, oldBox);
        found(a);

        assertThat(link.applyVerifiedEmail(event(a, true))).contains(oldBox);
        verify(unlinks).report(new AccountEmailUnlinks.Linked(a.getId(), owner, oldBox, EmailSource.CUSTOM),
                AccountEmailUnlinks.Reason.RELINKED);
    }

    @Test
    void sameBoxAgainReplacesNothing() {
        UserAccount a = account("alibek1@efbazaar.uz", EmailSource.CUSTOM, mailbox);
        found(a);

        assertThat(link.applyVerifiedEmail(event(a, true))).isEmpty();
        verify(unlinks, never()).report(any(), any());
    }

    @Test
    void ignoresAnotherOwnersAccount() {
        UserAccount a = account(null, null, null);
        a.setOwnerId(UUID.randomUUID());
        found(a);

        var e = event(a, true);
        link.applyVerifiedEmail(e);

        assertThat(a.getEmail()).isNull();
        verify(accounts, never()).saveAndFlush(any());
        // trade-service already linked the box: tell it to let go.
        verify(unlinks).report(new AccountEmailUnlinks.Linked(a.getId(), owner, mailbox, EmailSource.CUSTOM),
                AccountEmailUnlinks.Reason.IGNORED);
    }

    @Test
    void ignoresAnArchivedAccount() {
        UserAccount a = account(null, null, null);
        a.setStatus(UserAccountStatus.ARCHIVED);
        found(a);

        link.applyVerifiedEmail(event(a, true));

        assertThat(a.isEmailVerified()).isFalse();
        verify(accounts, never()).saveAndFlush(any());
        verify(unlinks).report(new AccountEmailUnlinks.Linked(a.getId(), owner, mailbox, EmailSource.CUSTOM),
                AccountEmailUnlinks.Reason.IGNORED);
    }

    @Test
    void freesTheTradeBoxItReplaced() {
        UUID tradeBox = UUID.randomUUID();
        UserAccount a = account("trade-1@efbazaar.uz", EmailSource.PLATFORM, tradeBox);
        a.setEmailVerified(true);
        found(a);

        link.applyVerifiedEmail(event(a, true));

        verify(unlinks).report(new AccountEmailUnlinks.Linked(a.getId(), owner, tradeBox, EmailSource.PLATFORM),
                AccountEmailUnlinks.Reason.RELINKED);
    }

    @Test
    void tradeHandoverMarksThePlatformEmailVerified() {
        UUID tradeId = UUID.randomUUID();
        UserAccount a = account(null, null, null);
        when(accounts.findByOwnerIdAndSourceTradeId(owner, tradeId)).thenReturn(Optional.of(a));
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));

        link.onMailboxHandedOver(tradeId, owner, "trade-1@efbazaar.uz");

        assertThat(a.isEmailVerified()).isTrue();
    }
}
