package uz.efbazaar.marketplace.account;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Eski e'lonlar uchun bir martalik ta'mir.
 *
 * <p>Sotilgan va o'chirilgan e'lonlar ataylab tashqarida: sotilgan akkount
 * endi sotuvchiniki emas va ro'yxatni behuda to'ldirardi.
 */
@ExtendWith(MockitoExtension.class)
class UserAccountBackfillTest {

    @Mock JdbcTemplate jdbc;
    @Mock ListingRepository listings;
    @Mock ListingAccountLink link;

    @Test
    void run_walksPagesUntilTheyAreEmpty() throws Exception {
        UUID listingId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        when(jdbc.queryForList(anyString(), eq(UUID.class), any(), any(), anyInt()))
                .thenReturn(List.of(listingId))
                .thenReturn(List.of());
        when(listings.findById(listingId)).thenReturn(Optional.of(listing));

        new UserAccountBackfill(jdbc, listings, link, 200).run(new DefaultApplicationArguments());

        verify(link).onListingCreated(listing);
    }

    @Test
    void run_skipsAListingThatDisappearedMidRun() throws Exception {
        UUID listingId = UUID.randomUUID();
        when(jdbc.queryForList(anyString(), eq(UUID.class), any(), any(), anyInt()))
                .thenReturn(List.of(listingId))
                .thenReturn(List.of());
        when(listings.findById(listingId)).thenReturn(Optional.empty());

        new UserAccountBackfill(jdbc, listings, link, 200).run(new DefaultApplicationArguments());

        verify(link, never()).onListingCreated(any());
    }
}
