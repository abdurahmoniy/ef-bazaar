package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.service.ListingService;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Akkount — yagona manba. Bozorda turgan e'lon u bilan birga yangilanadi,
 * lekin sotuv shartlari akkountga tegishli emas va tegilmaydi.
 */
@ExtendWith(MockitoExtension.class)
class UserAccountPropagationTest {

    @Mock UserAccountRepository accounts;
    @Mock ListingService listings;
    @InjectMocks UserAccountPublisher publisher;

    @Test
    void propagate_copiesContentButNeverPriceOrExchangeTerms() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(ownerId).currentListingId(listingId)
                .description("yangilangan tavsif")
                .attributes(new HashMap<>(Map.of(
                        "platform", "MOBILE", "team_strength", 3150, "exchange_mode", "BOTH")))
                .mediaMessageIds(new ArrayList<>(List.of("msg-2")))
                .build();

        publisher.propagate(account);

        ArgumentCaptor<ListingUpdateRequest> sent = ArgumentCaptor.forClass(ListingUpdateRequest.class);
        verify(listings).updateContent(eq(listingId), eq(ownerId), sent.capture(), eq(List.of("msg-2")));
        assertThat(sent.getValue().description()).isEqualTo("yangilangan tavsif");
        assertThat(sent.getValue().attributes()).containsEntry("team_strength", 3150);
        // Obmen sharti e'lonniki: akkountda qolib ketgan qiymat uni bosib ketmasin.
        assertThat(sent.getValue().attributes()).doesNotContainKey("exchange_mode");
        // null narx — ListingMapper NullValuePropertyMappingStrategy.IGNORE bilan
        // ishlaydi, ya'ni e'londagi joriy qiymat tegilmaydi.
        assertThat(sent.getValue().price()).isNull();
        assertThat(sent.getValue().priceNegotiable()).isNull();
    }

    @Test
    void propagate_doesNothingWhenTheAccountIsNotOnTheMarket() {
        UserAccount idle = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(UUID.randomUUID())
                .attributes(new HashMap<>()).build();

        publisher.propagate(idle);

        verifyNoInteractions(listings);
    }

    @Test
    void propagate_unlinksWhenTheListingIsGone() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UserAccount account = UserAccount.builder()
                .id(UUID.randomUUID()).ownerId(ownerId).currentListingId(listingId)
                .attributes(new HashMap<>()).mediaMessageIds(new ArrayList<>()).build();
        when(listings.updateContent(eq(listingId), eq(ownerId), any(), any()))
                .thenThrow(MarketplaceException.listingNotFound());

        publisher.propagate(account);

        assertThat(account.getCurrentListingId()).isNull();
        verify(accounts).saveAndFlush(account);
    }
}
