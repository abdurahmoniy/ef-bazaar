package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mapstruct.factory.Mappers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingServiceTest {

    @Mock ListingRepository repository;
    @Mock MarketplaceEventPublisher events;
    @Spy  ListingMapper mapper = Mappers.getMapper(ListingMapper.class);

    @InjectMocks ListingService service;

    private UUID sellerId;
    private ListingCreateRequest createReq;

    @BeforeEach
    void setUp() {
        sellerId = UUID.randomUUID();
        createReq = new ListingCreateRequest(
                "Strong eFootball account with Messi",
                List.of("Messi", "Ronaldo"),
                true,
                5,
                100000,
                50000,
                3200,
                new BigDecimal("450000.00"),
                true
        );
    }

    @Test
    void create_setsSellerAndDefaultsStatusActive() {
        when(repository.save(any(Listing.class))).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            l.setId(UUID.randomUUID());
            return l;
        });

        Listing saved = service.create(sellerId, createReq);

        assertThat(saved.getSellerId()).isEqualTo(sellerId);
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ACTIVE);
        assertThat(saved.getDescription()).contains("Messi");
        assertThat(saved.getValuablePlayers()).containsExactly("Messi", "Ronaldo");
        assertThat(saved.isPriceNegotiable()).isTrue();
        assertThat(saved.getHighestDivisionLevel()).isEqualTo(5);
    }

    @Test
    void update_rejectsNonOwner() {
        UUID otherUser = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        Listing l = Listing.builder()
                .id(listingId)
                .sellerId(sellerId)
                .status(ListingStatus.ACTIVE)
                .build();
        when(repository.findById(listingId)).thenReturn(Optional.of(l));

        ListingUpdateRequest req = new ListingUpdateRequest(
                null, null, null, null, null, null, null,
                new BigDecimal("999.00"), null);

        assertThatThrownBy(() -> service.update(listingId, otherUser, req))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("egasi");
    }

    @Test
    void delete_setsStatusDeleted() {
        UUID listingId = UUID.randomUUID();
        Listing l = Listing.builder()
                .id(listingId).sellerId(sellerId).status(ListingStatus.ACTIVE).build();
        when(repository.findById(listingId)).thenReturn(Optional.of(l));

        Listing result = service.delete(listingId, sellerId);
        assertThat(result.getStatus()).isEqualTo(ListingStatus.DELETED);
    }

    @Test
    void update_rejectsWhenAlreadySold() {
        UUID listingId = UUID.randomUUID();
        Listing l = Listing.builder()
                .id(listingId).sellerId(sellerId).status(ListingStatus.SOLD).build();
        when(repository.findById(listingId)).thenReturn(Optional.of(l));

        ListingUpdateRequest req = new ListingUpdateRequest(
                null, null, null, null, null, null, null,
                new BigDecimal("999.00"), null);

        assertThatThrownBy(() -> service.update(listingId, sellerId, req))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("aktiv emas");
    }

    @Test
    void getById_throwsWhenNotFound() {
        UUID listingId = UUID.randomUUID();
        when(repository.findById(listingId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(listingId))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("topilmadi");
    }
}
