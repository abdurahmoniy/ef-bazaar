package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import uz.efbazaar.marketplace.account.dto.UserAccountCreateRequest;
import uz.efbazaar.marketplace.account.dto.UserAccountUpdateRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserAccountServiceTest {

    @Mock UserAccountRepository accounts;
    @Mock UserAccountCardInventory inventory;
    @Mock UserAccountPublisher publisher;
    @Mock uz.efbazaar.marketplace.service.MediaService media;
    @Mock uz.efbazaar.marketplace.service.ListingCaptionBuilder captions;
    @Mock AccountEmailUnlinks unlinks;
    @InjectMocks UserAccountService service;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();

    private UserAccount account() {
        return UserAccount.builder().id(accountId).ownerId(ownerId)
                .status(UserAccountStatus.ACTIVE).attributes(new HashMap<>()).build();
    }

    @Test
    void get_refusesSomeoneElsesAccount() {
        UUID stranger = UUID.randomUUID();
        when(accounts.findByIdAndOwnerId(accountId, stranger)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(accountId, stranger))
                .isInstanceOf(MarketplaceException.class)
                .extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void update_writesSquadInventory_andPropagatesToTheListing() {
        UserAccount existing = account();
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(existing));
        when(accounts.saveAndFlush(existing)).thenReturn(existing);
        Map<String, Object> attributes = Map.of("valuable_players",
                List.of(Map.of("efhub_id", 1, "player_id", UUID.randomUUID().toString())));

        service.update(accountId, ownerId, new UserAccountUpdateRequest(
                "Asosiy", "tavsif", attributes, List.of("msg-1")));

        assertThat(existing.getTitle()).isEqualTo("Asosiy");
        assertThat(existing.getDescription()).isEqualTo("tavsif");
        assertThat(existing.getMediaMessageIds()).containsExactly("msg-1");
        verify(inventory).replace(accountId, attributes.get("valuable_players"));
        verify(publisher).propagate(existing);
    }

    @Test
    void create_storesTheOwnerAndSquad() {
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));

        UserAccount created = service.create(ownerId, new UserAccountCreateRequest(
                "Ikkinchi", "tavsif", Map.of("platform", "MOBILE"), List.of("msg-9")));

        assertThat(created.getOwnerId()).isEqualTo(ownerId);
        assertThat(created.getStatus()).isEqualTo(UserAccountStatus.ACTIVE);
        assertThat(created.getEmail()).isNull();
        verify(inventory).replace(created.getId(), null);
    }

    @Test
    void replaceMedia_uploadsThenStoresTheMessageIds() {
        UserAccount existing = account();
        existing.setTitle("Asosiy");
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(existing));
        when(accounts.saveAndFlush(existing)).thenReturn(existing);
        when(captions.build(existing)).thenReturn("<b>Akkount</b> <code>5c8016ad</code>");
        when(media.uploadToBotForAccount(any(), any(), eq(accountId)))
                .thenReturn(List.of("msg-1", "msg-2"));

        service.replaceMedia(accountId, ownerId, List.of());

        verify(media).validate(any());
        // Media topigiga e'lonникi bilan bir xil to'liq izoh ketadi, akkount
        // nomi emas: admin u yerda rasmlardan boshqa hech narsa ko'rmasdi.
        verify(media).uploadToBotForAccount(any(),
                eq("<b>Akkount</b> <code>5c8016ad</code>"), eq(accountId));
        // Bog'lanish akkountga: e'lon id si bu yerda umuman ishlatilmaydi.
        verify(media, never()).uploadToBot(any(), any(), any());
        assertThat(existing.getMediaMessageIds()).containsExactly("msg-1", "msg-2");
        verify(publisher).propagate(existing);
    }

    @Test
    void delete_refusesWhileOnMarket() {
        UserAccount published = account();
        published.setCurrentListingId(UUID.randomUUID());
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(published));

        assertThatThrownBy(() -> service.delete(accountId, ownerId))
                .isInstanceOf(MarketplaceException.class)
                .extracting("status").isEqualTo(HttpStatus.CONFLICT);
        verify(accounts, never()).delete(any());
    }

    @Test
    void setEmail_marksItManual_andClearsTheMailboxLink() {
        UserAccount existing = account();
        existing.setMailboxId(UUID.randomUUID());
        existing.setEmailSource(EmailSource.PLATFORM);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(existing));
        when(accounts.saveAndFlush(existing)).thenReturn(existing);

        service.setEmail(accountId, ownerId, "men@example.com");

        assertThat(existing.getEmail()).isEqualTo("men@example.com");
        assertThat(existing.getEmailSource()).isEqualTo(EmailSource.MANUAL);
        assertThat(existing.getMailboxId()).isNull();
    }

    @Test
    void setEmail_dropsTheVerifiedMark() {
        // A typed address has not been proven to be on the Konami account.
        UserAccount existing = account();
        existing.setEmail("alibek1@efbazaar.uz");
        existing.setEmailSource(EmailSource.CUSTOM);
        existing.setEmailVerified(true);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(existing));
        when(accounts.saveAndFlush(existing)).thenReturn(existing);

        UUID box = UUID.randomUUID();
        existing.setMailboxId(box);

        service.setEmail(accountId, ownerId, "men@example.com");

        assertThat(existing.isEmailVerified()).isFalse();
        verify(unlinks).report(new AccountEmailUnlinks.Linked(accountId, ownerId, box, EmailSource.CUSTOM),
                AccountEmailUnlinks.Reason.EDITED);
    }

    @Test
    void setEmail_withBlankValue_clearsIt() {
        UserAccount existing = account();
        existing.setEmail("eski@efbazaar.uz");
        existing.setEmailSource(EmailSource.PLATFORM);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(existing));
        when(accounts.saveAndFlush(existing)).thenReturn(existing);

        service.setEmail(accountId, ownerId, "   ");

        assertThat(existing.getEmail()).isNull();
        assertThat(existing.getEmailSource()).isNull();
    }

    private UserAccount sold(ArchivedReason reason, java.time.Instant at) {
        return UserAccount.builder().id(UUID.randomUUID()).ownerId(ownerId)
                .status(UserAccountStatus.ARCHIVED).archivedReason(reason).archivedAt(at)
                .attributes(new HashMap<>()).build();
    }

    @Test
    void list_keepsSoldAndSwappedAccountsAsHistoryAfterTheActiveOnes() {
        UserAccount active = account();
        UserAccount sold = sold(ArchivedReason.SOLD_ON_PLATFORM, java.time.Instant.now());
        when(accounts.findByOwnerIdAndStatusOrderByCreatedAtDesc(ownerId, UserAccountStatus.ACTIVE))
                .thenReturn(List.of(active));
        when(accounts.findByOwnerIdAndStatusAndArchivedReasonInOrderByArchivedAtDescCreatedAtDesc(
                ownerId, UserAccountStatus.ARCHIVED, UserAccountService.HISTORY_REASONS))
                .thenReturn(List.of(sold));

        assertThat(service.list(ownerId)).containsExactly(active, sold);
        assertThat(UserAccountService.HISTORY_REASONS).containsExactlyInAnyOrder(
                ArchivedReason.SOLD_ON_PLATFORM, ArchivedReason.SOLD_ELSEWHERE,
                ArchivedReason.SWAPPED_ON_PLATFORM);
    }

    @Test
    void aSoldAccountIsReadOnly() {
        UserAccount sold = sold(ArchivedReason.SOLD_ELSEWHERE, java.time.Instant.now());
        when(accounts.findByIdAndOwnerId(sold.getId(), ownerId)).thenReturn(Optional.of(sold));

        // O'qish mumkin, o'zgartirish emas.
        assertThat(service.get(sold.getId(), ownerId)).isSameAs(sold);
        for (org.junit.jupiter.api.function.Executable change : List.<org.junit.jupiter.api.function.Executable>of(
                () -> service.update(sold.getId(), ownerId, new UserAccountUpdateRequest("x", null, Map.of(), List.of())),
                () -> service.setEmail(sold.getId(), ownerId, "a@efbazaar.uz"),
                () -> service.replaceMedia(sold.getId(), ownerId, List.of()),
                () -> service.delete(sold.getId(), ownerId))) {
            assertThatThrownBy(change::execute)
                    .isInstanceOf(MarketplaceException.class)
                    .extracting("code").isEqualTo("account_archived");
        }
        verify(accounts, never()).saveAndFlush(any());
        verify(accounts, never()).delete(any());
    }
}
