package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.account.ListingAccountLink;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.referral.ReferralService;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TradeSucceededConsumerSwapTest {

    private final ReferralService referrals = mock(ReferralService.class);
    private final ListingAccountLink accounts = mock(ListingAccountLink.class);
    private final ListingService listingService = mock(ListingService.class);
    private final TradeSucceededConsumer consumer = new TradeSucceededConsumer(referrals, accounts, listingService);

    @Test
    void theGivenAccountsListingIsMarkedSoldToTheSeller() {
        UUID trade = UUID.randomUUID(), buyer = UUID.randomUUID(), seller = UUID.randomUUID();
        UUID listing = UUID.randomUUID(), given = UUID.randomUUID(), givenListing = UUID.randomUUID();
        when(accounts.onTradeSucceeded(trade, listing, buyer, seller, "SWAP", given)).thenReturn(givenListing);

        consumer.onTradeSucceeded(new TradeSucceededDto(trade, buyer, seller, listing, "SMART", "SWAP", given, Instant.now()));

        verify(listingService).markSold(eq(givenListing), eq(seller), any(Instant.class));
    }

    @Test
    void nothingIsClosedWithoutAListedAccount() {
        UUID trade = UUID.randomUUID();
        when(accounts.onTradeSucceeded(any(), any(), any(), any(), any(), any())).thenReturn(null);

        consumer.onTradeSucceeded(new TradeSucceededDto(trade, UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "SMART", "SWAP", null, Instant.now()));

        verifyNoInteractions(listingService);
    }
}
