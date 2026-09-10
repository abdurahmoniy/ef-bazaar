package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ListingViewServiceTest {
    private final ListingService listings = mock(ListingService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ListingViewService service = new ListingViewService(listings, jdbc);
    private final UUID id = UUID.randomUUID();
    private final UUID guest = UUID.randomUUID();
    private final UUID seller = UUID.randomUUID();

    @SuppressWarnings("unchecked")
    @Test
    void guestViewReturnsThePersistedIncrement() {
        when(listings.getForViewer(id, null)).thenReturn(listing(ListingStatus.ACTIVE));
        when(jdbc.query(anyString(), any(RowMapper.class), anyString(), eq(id), eq(id))).thenReturn(List.of(8L));
        assertThat(service.recordView(id, null, guest)).isEqualTo(8L);
        verify(jdbc).query(anyString(), any(RowMapper.class), eq("guest:" + guest), eq(id), eq(id));
    }

    @SuppressWarnings("unchecked")
    @Test
    void signedInBuyerViewIsCounted() {
        UUID viewer = UUID.randomUUID();
        when(listings.getForViewer(id, viewer)).thenReturn(listing(ListingStatus.ACTIVE));
        when(jdbc.query(anyString(), any(RowMapper.class), anyString(), eq(id), eq(id))).thenReturn(List.of(8L));
        assertThat(service.recordView(id, viewer, null)).isEqualTo(8L);
        verify(jdbc).query(anyString(), any(RowMapper.class), eq("user:" + viewer), eq(id), eq(id));
    }

    @Test
    void sellerViewsDoNotIncrement() {
        when(listings.getForViewer(id, seller)).thenReturn(listing(ListingStatus.ACTIVE));
        assertThat(service.recordView(id, seller, null)).isEqualTo(7L);
        verifyNoInteractions(jdbc);
    }

    @Test
    void authorizedSoldListingViewsDoNotIncrement() {
        UUID buyer = UUID.randomUUID();
        when(listings.getForViewer(id, buyer)).thenReturn(listing(ListingStatus.SOLD));
        assertThat(service.recordView(id, buyer, null)).isEqualTo(7L);
        verifyNoInteractions(jdbc);
    }

    @Test
    void deletedListingsCannotBeCounted() {
        when(listings.getForViewer(id, null)).thenReturn(listing(ListingStatus.DELETED));
        assertThatThrownBy(() -> service.recordView(id, null, guest)).isInstanceOf(MarketplaceException.class);
        verifyNoInteractions(jdbc);
    }

    @Test
    void missingOrInaccessibleListingsCannotBeCounted() {
        when(listings.getForViewer(id, null)).thenThrow(MarketplaceException.listingNotFound());
        assertThatThrownBy(() -> service.recordView(id, null, guest)).isInstanceOf(MarketplaceException.class);
        verifyNoInteractions(jdbc);
    }

    @SuppressWarnings("unchecked")
    @Test
    void listingDeactivatedDuringTheRequestIsNotCounted() {
        when(listings.getForViewer(id, null)).thenReturn(listing(ListingStatus.ACTIVE));
        when(jdbc.query(anyString(), any(RowMapper.class), anyString(), eq(id), eq(id))).thenReturn(List.of());
        assertThatThrownBy(() -> service.recordView(id, null, guest)).isInstanceOf(MarketplaceException.class);
    }

    private Listing listing(ListingStatus status) {
        return Listing.builder().id(id).sellerId(seller).status(status).viewCount(7).build();
    }
}
