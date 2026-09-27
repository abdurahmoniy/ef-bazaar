package uz.efbazaar.marketplace.account;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.kafka.TradeSucceededConsumer;
import uz.efbazaar.marketplace.kafka.TradeSucceededDto;
import uz.efbazaar.marketplace.referral.ReferralService;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AccountTradeOriginTest {

    @ParameterizedTest
    @CsvSource({
            "SALE, true", "SALE, false",
            "SWAP, true", "SWAP, false",
            "SWAP_SURCHARGE, true", "SWAP_SURCHARGE, false",
            ", true", ", false"
    })
    void receivedAccountsKeepTheirOriginAndDetailsRegardlessOfMailboxOrder(String kind, boolean mailboxFirst)
            throws Exception {
        UUID tradeId = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        UUID buyerId = UUID.randomUUID();
        UUID sellerId = UUID.randomUUID();
        boolean swap = kind != null && kind.startsWith("SWAP");
        String expectedTitle = swap ? "Obmendan kelgan akkount" : "Savdodan kelgan akkount";
        UserAccountRepository accounts = mock(UserAccountRepository.class);
        PendingAccountEmailRepository pendingEmails = mock(PendingAccountEmailRepository.class);
        ListingRepository listings = mock(ListingRepository.class);
        UserAccountCardInventory inventory = mock(UserAccountCardInventory.class);
        Map<UUID, UserAccount> received = new HashMap<>();
        Map<UUID, PendingAccountEmail> waiting = new HashMap<>();
        when(accounts.findByOwnerIdAndSourceTradeId(any(), any()))
                .thenAnswer(i -> Optional.ofNullable(received.get(i.getArgument(0))));
        when(accounts.saveAndFlush(any())).thenAnswer(i -> {
            UserAccount account = i.getArgument(0);
            received.put(account.getOwnerId(), account);
            return account;
        });
        when(pendingEmails.findByTradeIdAndUserId(any(), any()))
                .thenAnswer(i -> Optional.ofNullable(waiting.get(i.getArgument(1))));
        lenient().when(pendingEmails.save(any())).thenAnswer(i -> {
            PendingAccountEmail pending = i.getArgument(0);
            waiting.put(pending.getUserId(), pending);
            return pending;
        });
        lenient().doAnswer(i -> {
            waiting.remove(((PendingAccountEmail) i.getArgument(0)).getUserId());
            return null;
        }).when(pendingEmails).delete(any());
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setDescription("Detailed first line\nFull listing description is preserved.");
        listing.setAttributes(Map.of("platform", "MOBILE", "exchange_mode", "BOTH",
                "valuable_players", List.of(Map.of("efhub_id", 7))));
        listing.setMediaMessageIds(List.of("photo-1"));
        when(listings.findById(listingId)).thenReturn(Optional.of(listing));
        ListingAccountLink link = new ListingAccountLink(accounts, inventory, listings, pendingEmails);
        TradeSucceededConsumer consumer = new TradeSucceededConsumer(mock(ReferralService.class), link);
        // Parse the producer's wire payload, including an absent kind on old events.
        var mapper = JsonMapper.builder().findAndAddModules()
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
        var json = mapper.createObjectNode()
                .put("tradeId", tradeId.toString()).put("listingId", listingId.toString())
                .put("buyerId", buyerId.toString()).put("sellerId", sellerId.toString())
                .put("mode", "SMART");
        if (kind != null) json.put("kind", kind);
        TradeSucceededDto event = mapper.treeToValue(json, TradeSucceededDto.class);

        if (mailboxFirst) handOverMailboxes(link, tradeId, buyerId, sellerId, swap);
        consumer.onTradeSucceeded(event);
        if (!mailboxFirst) handOverMailboxes(link, tradeId, buyerId, sellerId, swap);

        UserAccount buyer = received.get(buyerId);
        assertThat(buyer.getTitle()).isEqualTo(expectedTitle);
        assertThat(buyer.getDescription()).isEqualTo(listing.getDescription());
        assertThat(buyer.getAttributes()).containsEntry("platform", "MOBILE")
                .containsEntry("valuable_players", listing.getAttributes().get("valuable_players"))
                .doesNotContainKey("exchange_mode");
        assertThat(buyer.getMediaMessageIds()).containsExactly("photo-1");
        assertThat(buyer.getEmail()).isEqualTo("buyer@efbazaar.uz");
        assertThat(buyer.getEmailSource()).isEqualTo(EmailSource.PLATFORM);
        assertThat(received).hasSize(swap ? 2 : 1);
        if (swap) {
            assertThat(received.get(sellerId).getTitle()).isEqualTo(expectedTitle);
            assertThat(received.get(sellerId).getEmail()).isEqualTo("seller@efbazaar.uz");
        }
        assertThat(waiting).isEmpty();

        buyer.setTitle("My renamed account");
        consumer.onTradeSucceeded(event);
        assertThat(buyer.getTitle()).isEqualTo("My renamed account");
        assertThat(received).hasSize(swap ? 2 : 1);
        verify(inventory).replace(buyer.getId(), listing.getAttributes().get("valuable_players"));
    }

    private void handOverMailboxes(ListingAccountLink link, UUID trade, UUID buyer, UUID seller, boolean swap) {
        link.onMailboxHandedOver(trade, buyer, "buyer@efbazaar.uz");
        link.drainPendingEmail(trade, buyer);
        if (swap) {
            link.onMailboxHandedOver(trade, seller, "seller@efbazaar.uz");
            link.drainPendingEmail(trade, seller);
        }
    }
}
