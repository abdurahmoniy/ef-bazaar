package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import uz.efbazaar.marketplace.account.dto.PublishAccountRequest;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.service.ListingService;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Bozorga chiqarish — akkountdan e'longa KO'CHIRISH.
 *
 * <p>Eng muhim tekshiruv: email hech qanday ko'rinishda e'lon so'roviga
 * tushmaydi. Ko'chirish oq ro'yxat bo'yicha ketadi, "emaildan boshqa
 * hammasi" degan qoida bilan emas.
 */
@ExtendWith(MockitoExtension.class)
class UserAccountPublisherTest {

    @Mock UserAccountRepository accounts;
    @Mock ListingService listings;
    @InjectMocks UserAccountPublisher publisher;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID accountId = UUID.randomUUID();

    private UserAccount account() {
        return UserAccount.builder()
                .id(accountId).ownerId(ownerId)
                .description("tavsif")
                .attributes(new HashMap<>(Map.of("platform", "MOBILE")))
                .mediaMessageIds(new ArrayList<>(List.of("msg-1")))
                .email("private@efbazaar.uz").emailSource(EmailSource.PLATFORM)
                .status(UserAccountStatus.ACTIVE)
                .build();
    }

    @Test
    void publish_createsListingFromAccount_withoutTheEmail() {
        UserAccount account = account();
        UUID listingId = UUID.randomUUID();
        Listing created = new Listing();
        created.setId(listingId);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(account));
        when(listings.createWithUploadedMedia(eq(ownerId), any(ListingCreateRequest.class), eq(List.of("msg-1"))))
                .thenReturn(created);
        when(accounts.saveAndFlush(account)).thenReturn(account);

        publisher.publish(accountId, ownerId, new PublishAccountRequest(
                new BigDecimal("2400000"), true, "EXCHANGE_ONLY", null));

        ArgumentCaptor<ListingCreateRequest> sent = ArgumentCaptor.forClass(ListingCreateRequest.class);
        verify(listings).createWithUploadedMedia(eq(ownerId), sent.capture(), eq(List.of("msg-1")));
        assertThat(sent.getValue().description()).isEqualTo("tavsif");
        assertThat(sent.getValue().price()).isEqualByComparingTo("2400000");
        assertThat(sent.getValue().priceNegotiable()).isTrue();
        assertThat(sent.getValue().attributes()).containsEntry("platform", "MOBILE");
        assertThat(sent.getValue().attributes()).containsEntry("exchange_mode", "EXCHANGE_ONLY");
        assertThat(sent.getValue().attributes().toString()).doesNotContain("efbazaar.uz");
        assertThat(account.getCurrentListingId()).isEqualTo(listingId);
        assertThat(account.getSourceListingId()).isEqualTo(listingId);
    }

    @Test
    void publish_refusesAnAccountAlreadyOnTheMarket() {
        UserAccount published = account();
        published.setCurrentListingId(UUID.randomUUID());
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(published));

        assertThatThrownBy(() -> publisher.publish(accountId, ownerId,
                new PublishAccountRequest(new BigDecimal("2400000"), false, null, null)))
                .isInstanceOf(MarketplaceException.class)
                .extracting("status").isEqualTo(HttpStatus.CONFLICT);
        verifyNoInteractions(listings);
    }

    @Test
    void publish_refusesAnAccountWithoutPhotos() {
        UserAccount noPhotos = account();
        noPhotos.setMediaMessageIds(new ArrayList<>());
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(noPhotos));

        assertThatThrownBy(() -> publisher.publish(accountId, ownerId,
                new PublishAccountRequest(new BigDecimal("2400000"), false, null, null)))
                .isInstanceOf(MarketplaceException.class)
                .extracting("status").isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(listings);
    }

    @Test
    void publish_refusesSomeoneElsesAccount() {
        UUID stranger = UUID.randomUUID();
        when(accounts.findByIdAndOwnerId(accountId, stranger)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> publisher.publish(accountId, stranger,
                new PublishAccountRequest(new BigDecimal("2400000"), false, null, null)))
                .isInstanceOf(MarketplaceException.class)
                .extracting("status").isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void unpublish_deletesTheListingAndClearsTheLink() {
        UserAccount published = account();
        UUID listingId = UUID.randomUUID();
        published.setCurrentListingId(listingId);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(published));
        when(accounts.saveAndFlush(published)).thenReturn(published);

        publisher.unpublish(accountId, ownerId);

        verify(listings).delete(listingId, ownerId);
        assertThat(published.getCurrentListingId()).isNull();
    }

    @Test
    void unpublish_isQuietWhenTheAccountIsNotOnTheMarket() {
        UserAccount idle = account();
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(idle));
        when(accounts.saveAndFlush(idle)).thenReturn(idle);

        publisher.unpublish(accountId, ownerId);

        verifyNoInteractions(listings);
    }

    @Test
    void aSoldAccountCannotGoBackOnTheMarketOrBeUnpublished() {
        UserAccount sold = account();
        sold.setStatus(UserAccountStatus.ARCHIVED);
        sold.setArchivedReason(ArchivedReason.SOLD_ON_PLATFORM);
        when(accounts.findByIdAndOwnerId(accountId, ownerId)).thenReturn(Optional.of(sold));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> publisher.publish(accountId, ownerId,
                        new uz.efbazaar.marketplace.account.dto.PublishAccountRequest(
                                new java.math.BigDecimal("100000"), false, null, null)))
                .extracting("code").isEqualTo("account_archived");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> publisher.unpublish(accountId, ownerId))
                .extracting("code").isEqualTo("account_archived");
        verifyNoInteractions(listings);
    }
}
