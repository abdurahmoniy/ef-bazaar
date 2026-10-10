package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.Listing;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Har e'lon ortida akkount turadi.
 *
 * <p>Sabab oddiy: akkountni sotuvga qo'ya olgan odam uning egasi. Alohida
 * "akkountlarimga saqlansinmi" belgisi shuning uchun yo'q.
 */
@ExtendWith(MockitoExtension.class)
class ListingAccountLinkTest {

    @Mock UserAccountRepository accounts;
    @Mock UserAccountCardInventory inventory;
    @Mock uz.efbazaar.marketplace.repository.ListingRepository listings;
    @InjectMocks ListingAccountLink link;

    private Listing listing(UUID sellerId) {
        Listing listing = new Listing();
        listing.setId(UUID.randomUUID());
        listing.setSellerId(sellerId);
        listing.setDescription("tavsif");
        listing.setAttributes(new HashMap<>(Map.of(
                "platform", "MOBILE", "exchange_mode", "BOTH",
                "valuable_players", List.of(Map.of("efhub_id", 7, "player_id", UUID.randomUUID().toString())))));
        listing.setMediaMessageIds(new ArrayList<>(List.of("msg-1")));
        return listing;
    }

    @Test
    void onListingCreated_buildsAnAccountBehindTheListing() {
        UUID sellerId = UUID.randomUUID();
        Listing listing = listing(sellerId);
        when(accounts.existsBySourceListingId(listing.getId())).thenReturn(false);
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));

        link.onListingCreated(listing);

        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts).saveAndFlush(saved.capture());
        UserAccount account = saved.getValue();
        assertThat(account.getOwnerId()).isEqualTo(sellerId);
        assertThat(account.getCurrentListingId()).isEqualTo(listing.getId());
        assertThat(account.getSourceListingId()).isEqualTo(listing.getId());
        assertThat(account.getDescription()).isEqualTo("tavsif");
        assertThat(account.getMediaMessageIds()).containsExactly("msg-1");
        // Sotuv sharti e'lonniki, akkountga ko'chmaydi.
        assertThat(account.getAttributes()).doesNotContainKey("exchange_mode");
        assertThat(account.getEmail()).isNull();
        verify(inventory).replace(account.getId(), listing.getAttributes().get("valuable_players"));
    }

    @Test
    void onListingCreated_isIdempotent() {
        Listing listing = listing(UUID.randomUUID());
        when(accounts.existsBySourceListingId(listing.getId())).thenReturn(true);

        link.onListingCreated(listing);

        verify(accounts, never()).saveAndFlush(any());
    }

    @Test
    void onListingSoldByOwner_archivesAndDetachesTheEmail() {
        UUID listingId = UUID.randomUUID();
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(UUID.randomUUID())
                .currentListingId(listingId).sourceListingId(listingId)
                .email("a@efbazaar.uz").emailSource(EmailSource.PLATFORM)
                .mailboxId(UUID.randomUUID()).status(UserAccountStatus.ACTIVE)
                .build();
        when(accounts.findByCurrentListingId(listingId)).thenReturn(Optional.of(account));
        uz.efbazaar.marketplace.domain.Listing listing = new uz.efbazaar.marketplace.domain.Listing();
        listing.setId(listingId);
        listing.setPrice(new java.math.BigDecimal("500000"));
        when(listings.findById(listingId)).thenReturn(Optional.of(listing));

        link.onListingSoldByOwner(listingId);

        assertThat(account.getArchivedAt()).isNotNull();
        assertThat(account.getSoldPrice()).isEqualByComparingTo("500000");
        assertThat(account.getStatus()).isEqualTo(UserAccountStatus.ARCHIVED);
        assertThat(account.getArchivedReason()).isEqualTo(ArchivedReason.SOLD_ELSEWHERE);
        assertThat(account.getEmail()).isNull();
        assertThat(account.getEmailSource()).isNull();
        assertThat(account.getMailboxId()).isNull();
        assertThat(account.getCurrentListingId()).isNull();
        verify(accounts).saveAndFlush(account);
    }

    @Test
    void onListingSoldByOwner_isQuietWhenNoAccountIsLinked() {
        UUID listingId = UUID.randomUUID();
        when(accounts.findByCurrentListingId(listingId)).thenReturn(Optional.empty());

        link.onListingSoldByOwner(listingId);

        verify(accounts, never()).saveAndFlush(any());
    }
}
