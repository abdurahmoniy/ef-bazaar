package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

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
 * Savdo yakunlanganda akkount sotuvchidan xaridorga ko'chadi.
 *
 * <p>Pochta alohida hodisa bilan keladi va u savdo hodisasidan OLDIN ham
 * yetib kelishi mumkin — Kafka topiklari orasida tartib kafolati yo'q.
 * Shuning uchun email kutib turadigan joy bor.
 */
@ExtendWith(MockitoExtension.class)
class AccountTradeHandoverTest {

    @Mock UserAccountRepository accounts;
    @Mock UserAccountCardInventory inventory;
    @Mock ListingRepository listings;
    @Mock PendingAccountEmailRepository pendingEmails;
    @InjectMocks ListingAccountLink link;

    private final UUID tradeId = UUID.randomUUID();
    private final UUID listingId = UUID.randomUUID();
    private final UUID sellerId = UUID.randomUUID();
    private final UUID buyerId = UUID.randomUUID();

    private Listing listing() {
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setSellerId(sellerId);
        listing.setDescription("tavsif");
        listing.setAttributes(new HashMap<>(Map.of("platform", "MOBILE", "exchange_mode", "BOTH")));
        listing.setMediaMessageIds(new ArrayList<>(List.of("msg-1")));
        return listing;
    }

    private UserAccount sellerAccount() {
        return UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(sellerId)
                .currentListingId(listingId).sourceListingId(listingId)
                .email("seller@efbazaar.uz").emailSource(EmailSource.PLATFORM)
                .mailboxId(UUID.randomUUID()).status(UserAccountStatus.ACTIVE)
                .attributes(new HashMap<>()).mediaMessageIds(new ArrayList<>())
                .build();
    }

    @Test
    void tradeSucceeded_archivesTheSellerAndOpensOneForTheBuyer() {
        UserAccount seller = sellerAccount();
        when(accounts.findByCurrentListingId(listingId)).thenReturn(Optional.of(seller));
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId)).thenReturn(Optional.empty());
        when(listings.findById(listingId)).thenReturn(Optional.of(listing()));
        when(pendingEmails.findByTradeIdAndUserId(tradeId, buyerId)).thenReturn(Optional.empty());
        // Sotuvchida kutayotgan manzil yo'q — sotuv savdosi, obmen emas.
        when(pendingEmails.findByTradeIdAndUserId(tradeId, sellerId)).thenReturn(Optional.empty());
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, null);

        assertThat(seller.getStatus()).isEqualTo(UserAccountStatus.ARCHIVED);
        assertThat(seller.getArchivedReason()).isEqualTo(ArchivedReason.SOLD_ON_PLATFORM);
        assertThat(seller.getEmail()).isNull();
        assertThat(seller.getMailboxId()).isNull();
        assertThat(seller.getCurrentListingId()).isNull();

        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts, org.mockito.Mockito.atLeastOnce()).saveAndFlush(saved.capture());
        UserAccount buyerAccount = saved.getAllValues().stream()
                .filter(a -> buyerId.equals(a.getOwnerId()))
                .findFirst()
                .orElseThrow();
        assertThat(buyerAccount.getStatus()).isEqualTo(UserAccountStatus.ACTIVE);
        assertThat(buyerAccount.getSourceTradeId()).isEqualTo(tradeId);
        assertThat(buyerAccount.getTitle()).isEqualTo("Savdodan kelgan akkount");
        assertThat(buyerAccount.getDescription()).isEqualTo("tavsif");
        assertThat(buyerAccount.getMediaMessageIds()).containsExactly("msg-1");
        // Sotuv sharti e'lonniki — xaridorning akkountiga ko'chmaydi.
        assertThat(buyerAccount.getAttributes()).doesNotContainKey("exchange_mode");
        // Bozorda emas: e'lon sotilgan.
        assertThat(buyerAccount.getCurrentListingId()).isNull();
        assertThat(buyerAccount.getEmail()).isNull();
    }

    @Test
    void tradeSucceeded_isIdempotent() {
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId))
                .thenReturn(Optional.of(UserAccount.builder().id(UUID.randomUUID()).ownerId(buyerId).build()));
        when(pendingEmails.findByTradeIdAndUserId(tradeId, sellerId)).thenReturn(Optional.empty());

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, null);

        // Takroriy hodisa: na sotuvchining akkounti qayta arxivlanadi,
        // na xaridorga ikkinchi kartochka ochiladi.
        verify(accounts, never()).findByCurrentListingId(any());
        verify(accounts, never()).saveAndFlush(any());
        verify(listings, never()).findById(any());
    }

    @Test
    void tradeSucceeded_usesTheEmailThatArrivedFirst() {
        PendingAccountEmail pending = new PendingAccountEmail(tradeId, buyerId, "new@efbazaar.uz", null);
        when(accounts.findByCurrentListingId(listingId)).thenReturn(Optional.empty());
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId)).thenReturn(Optional.empty());
        when(listings.findById(listingId)).thenReturn(Optional.of(listing()));
        when(pendingEmails.findByTradeIdAndUserId(tradeId, buyerId)).thenReturn(Optional.of(pending));
        when(pendingEmails.findByTradeIdAndUserId(tradeId, sellerId)).thenReturn(Optional.empty());
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, null);

        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getEmail()).isEqualTo("new@efbazaar.uz");
        assertThat(saved.getValue().getEmailSource()).isEqualTo(EmailSource.PLATFORM);
        verify(pendingEmails).delete(pending);
    }

    @Test
    void tradeSucceeded_opensABareAccountForASwapPartnersMailbox() {
        // Obmen: sotuvchi ham quti oladi, lekin uning ortida e'lon yo'q.
        PendingAccountEmail waiting = new PendingAccountEmail(tradeId, sellerId, "swap@efbazaar.uz", null);
        when(pendingEmails.findByTradeIdAndUserId(tradeId, sellerId)).thenReturn(Optional.of(waiting));
        when(accounts.findByOwnerIdAndSourceTradeId(sellerId, tradeId)).thenReturn(Optional.empty());
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId))
                .thenReturn(Optional.of(UserAccount.builder().id(UUID.randomUUID()).ownerId(buyerId).build()));
        when(accounts.saveAndFlush(any(UserAccount.class))).thenAnswer(i -> i.getArgument(0));

        link.onTradeSucceeded(tradeId, listingId, buyerId, sellerId, null);

        ArgumentCaptor<UserAccount> saved = ArgumentCaptor.forClass(UserAccount.class);
        verify(accounts).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getOwnerId()).isEqualTo(sellerId);
        assertThat(saved.getValue().getEmail()).isEqualTo("swap@efbazaar.uz");
        assertThat(saved.getValue().getEmailSource()).isEqualTo(EmailSource.PLATFORM);
        assertThat(saved.getValue().getSourceTradeId()).isEqualTo(tradeId);
        verify(pendingEmails).delete(waiting);
    }

    @Test
    void mailboxHandedOver_attachesTheAddressToTheBuyersAccount() {
        UserAccount buyerAccount = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(buyerId).sourceTradeId(tradeId)
                .status(UserAccountStatus.ACTIVE).attributes(new HashMap<>()).build();
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId)).thenReturn(Optional.of(buyerAccount));

        link.onMailboxHandedOver(tradeId, buyerId, "new@efbazaar.uz");

        assertThat(buyerAccount.getEmail()).isEqualTo("new@efbazaar.uz");
        assertThat(buyerAccount.getEmailSource()).isEqualTo(EmailSource.PLATFORM);
        verify(accounts).saveAndFlush(buyerAccount);
        verify(pendingEmails, never()).save(any());
    }

    /**
     * Ikki hodisa bir vaqtda kelgan holat.
     *
     * <p>Ular ikki xil topikda va ikki xil tranzaksiyada ishlanadi, ya'ni
     * hech biri ikkinchisining hali commit qilinmagan yozuvini ko'rmaydi:
     * savdo hodisasi akkountni emailSIZ ochadi, pochta hodisasi esa o'sha
     * paytda akkount yo'q deb manzilni kutishga qo'yadi. Natijada akkount
     * abadiy emailsiz qoladi. Shuning uchun har ikki tomon o'z ishini
     * commit qilgach yana bir marta tekshiradi — oxirgi bo'lib tugagani
     * ikkalasini ham ko'radi.
     */
    @Test
    void drainPendingEmail_attachesWhatTheRaceLeftBehind() {
        UserAccount stranded = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(buyerId).sourceTradeId(tradeId)
                .status(UserAccountStatus.ACTIVE)
                .attributes(new HashMap<>()).mediaMessageIds(new ArrayList<>())
                .build();
        PendingAccountEmail pending =
                new PendingAccountEmail(tradeId, buyerId, "trade-05a64118@efbazaar.uz", null);
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId)).thenReturn(Optional.of(stranded));
        when(pendingEmails.findByTradeIdAndUserId(tradeId, buyerId)).thenReturn(Optional.of(pending));

        link.drainPendingEmail(tradeId, buyerId);

        assertThat(stranded.getEmail()).isEqualTo("trade-05a64118@efbazaar.uz");
        assertThat(stranded.getEmailSource()).isEqualTo(EmailSource.PLATFORM);
        verify(pendingEmails).delete(pending);
    }

    @Test
    void drainPendingEmail_keepsWaitingWhileTheAccountIsMissing() {
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId)).thenReturn(Optional.empty());

        link.drainPendingEmail(tradeId, buyerId);

        verify(pendingEmails, never()).delete(any());
    }

    @Test
    void drainPendingEmail_doesNotOverwriteAnAddressAlreadyAttached() {
        // Tez yo'l allaqachon ishlagan: manzil joyida, kutayotgan qator esa
        // shunchaki qoldiq — uni tozalash kerak, akkountga tegmasdan.
        UserAccount done = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(buyerId).sourceTradeId(tradeId)
                .email("already@efbazaar.uz").emailSource(EmailSource.PLATFORM)
                .status(UserAccountStatus.ACTIVE)
                .attributes(new HashMap<>()).mediaMessageIds(new ArrayList<>())
                .build();
        PendingAccountEmail pending =
                new PendingAccountEmail(tradeId, buyerId, "other@efbazaar.uz", null);
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId)).thenReturn(Optional.of(done));
        when(pendingEmails.findByTradeIdAndUserId(tradeId, buyerId)).thenReturn(Optional.of(pending));

        link.drainPendingEmail(tradeId, buyerId);

        assertThat(done.getEmail()).isEqualTo("already@efbazaar.uz");
        verify(pendingEmails).delete(pending);
    }

    @Test
    void mailboxHandedOver_waitsWhenTheAccountIsNotThereYet() {
        when(accounts.findByOwnerIdAndSourceTradeId(buyerId, tradeId)).thenReturn(Optional.empty());

        link.onMailboxHandedOver(tradeId, buyerId, "new@efbazaar.uz");

        ArgumentCaptor<PendingAccountEmail> saved = ArgumentCaptor.forClass(PendingAccountEmail.class);
        verify(pendingEmails).save(saved.capture());
        assertThat(saved.getValue().getEmail()).isEqualTo("new@efbazaar.uz");
        assertThat(saved.getValue().getTradeId()).isEqualTo(tradeId);
        assertThat(saved.getValue().getUserId()).isEqualTo(buyerId);
    }
}
