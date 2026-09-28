package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SwapAccountHandoverTest {

    @Mock UserAccountRepository accounts;
    @Mock UserAccountCardInventory inventory;
    @Mock ListingRepository listings;
    @Mock PendingAccountEmailRepository pendingEmails;
    @InjectMocks ListingAccountLink link;

    private final UUID tradeId = UUID.randomUUID();
    private final UUID listingId = UUID.randomUUID();
    private final UUID sellerId = UUID.randomUUID();
    private final UUID buyerId = UUID.randomUUID();
    private final UUID givenId = UUID.randomUUID();

    private UserAccount given(UUID currentListing) {
        return UserAccount.builder()
                .id(givenId).ownerId(buyerId).title("Asosiy akk").description("Kuchli akkount")
                .attributes(new HashMap<>(Map.of("team_strength", 3250, "valuable_players", List.of())))
                .mediaMessageIds(new ArrayList<>(List.of("m-1")))
                .email("buyer@efbazaar.uz").emailSource(EmailSource.PLATFORM).mailboxId(UUID.randomUUID())
                .status(UserAccountStatus.ACTIVE).currentListingId(currentListing).build();
    }

    private void common(UserAccount given) {
        when(accounts.findById(givenId)).thenReturn(Optional.of(given));
        when(accounts.findByOwnerIdAndSourceTradeId(any(), any())).thenReturn(Optional.empty());
        when(pendingEmails.findByTradeIdAndUserId(any(), any())).thenReturn(Optional.empty());
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setDescription("e'lon");
        listing.setAttributes(new HashMap<>());
        listing.setMediaMessageIds(new ArrayList<>());
        when(listings.findById(listingId)).thenReturn(Optional.of(listing));
    }

    private UserAccount savedFor(UUID owner) {
        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts, atLeastOnce()).saveAndFlush(saved.capture());
        return saved.getAllValues().stream().filter(a -> owner.equals(a.getOwnerId())
                && tradeId.equals(a.getSourceTradeId())).findFirst().orElseThrow();
    }

    @Test
    void theSellerReceivesAFullCopyAndTheBuyersIsArchived() {
        UserAccount given = given(null);
        common(given);

        UUID toClose = link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", givenId);

        assertThat(toClose).isNull();
        assertThat(given.getStatus()).isEqualTo(UserAccountStatus.ARCHIVED);
        assertThat(given.getArchivedReason()).isEqualTo(ArchivedReason.SWAPPED_ON_PLATFORM);
        assertThat(given.getEmail()).isNull();
        assertThat(given.getMailboxId()).isNull();

        UserAccount seller = savedFor(sellerId);
        assertThat(seller.getTitle()).isEqualTo("Asosiy akk");
        assertThat(seller.getDescription()).isEqualTo("Kuchli akkount");
        assertThat(seller.getMediaMessageIds()).containsExactly("m-1");
        assertThat(seller.getAttributes()).containsEntry("team_strength", 3250);
        assertThat(seller.getStatus()).isEqualTo(UserAccountStatus.ACTIVE);
        verify(inventory).replace(eq(seller.getId()), any());
    }

    @Test
    void noBareCardIsOpenedWhenAnAccountWasChosen() {
        common(given(null));

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", givenId);

        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts, atLeastOnce()).saveAndFlush(saved.capture());
        // Xaridor e'lon akkountini shu nom bilan oladi — tekshiruv faqat sotuvchiniki.
        assertThat(saved.getAllValues()).noneMatch(a -> sellerId.equals(a.getOwnerId())
                && "Obmendan kelgan akkount".equals(a.getTitle()));
    }

    @Test
    void aListedAccountReturnsItsListingToClose() {
        UUID listed = UUID.randomUUID();
        UserAccount given = given(listed);
        common(given);

        UUID toClose = link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP_SURCHARGE", givenId);

        assertThat(toClose).isEqualTo(listed);
        assertThat(given.getCurrentListingId()).isNull();
    }

    @Test
    void redeliveryDoesNothing() {
        common(given(null));
        when(accounts.findByOwnerIdAndSourceTradeId(sellerId, tradeId))
                .thenReturn(Optional.of(UserAccount.builder().id(UUID.randomUUID()).ownerId(sellerId).build()));

        UUID toClose = link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", givenId);

        assertThat(toClose).isNull();
        verify(accounts, never()).saveAndFlush(argThat(a -> sellerId.equals(a.getOwnerId())));
    }

    @Test
    void otherKeepsTheBareCard() {
        common(given(null));

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", null);

        assertThat(savedFor(sellerId).getTitle()).isEqualTo("Obmendan kelgan akkount");
        verify(accounts, never()).findById(givenId);
    }

    @Test
    void anAccountAlreadySoldElsewhereIsNotHandedOverAgain() {
        // Obmen tirik turganda akkountning e'loni boshqa savdoda sotildi: akkount
        // arxivda. Sotuvchiga uning nusxasi berilsa, ikki kishi bitta akkountga ega bo'lardi.
        UserAccount given = given(null);
        given.setStatus(UserAccountStatus.ARCHIVED);
        given.setArchivedReason(ArchivedReason.SOLD_ON_PLATFORM);
        common(given);

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, "SWAP", givenId);

        assertThat(given.getArchivedReason()).isEqualTo(ArchivedReason.SOLD_ON_PLATFORM);
        assertThat(savedFor(sellerId).getTitle()).isEqualTo("Obmendan kelgan akkount");
    }
}
