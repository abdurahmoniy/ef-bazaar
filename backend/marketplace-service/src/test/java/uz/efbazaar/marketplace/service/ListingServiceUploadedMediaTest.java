package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.partner.ads.ChannelPostService;
import uz.efbazaar.marketplace.partner.ads.OfficialChannelService;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.trust.BlacklistGuard;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Akkountdan e'lon: rasmlar allaqachon Telegram'da.
 *
 * <p>Qayta yuklash nafaqat ortiqcha — u yangi message id lar yasaydi va
 * akkountdagi rasmlar bilan e'londagilari ajralib ketardi.
 */
@ExtendWith(MockitoExtension.class)
class ListingServiceUploadedMediaTest {

    @Mock BlacklistGuard blacklistGuard;
    @Mock AuthSummaryClient telegramUsers;
    @Mock MediaService mediaService;
    @Mock AttributeValidator attributeValidator;
    @Mock ListingMapper mapper;
    @Mock ListingPersistence persistence;
    @Mock ChannelPostService channelPosts;
    @Mock OfficialChannelService officialChannel;
    @Mock MarketplaceEventPublisher events;
    @InjectMocks ListingService service;

    @Mock uz.efbazaar.marketplace.repository.ListingRepository listings;

    @Test
    void updateContent_replacesMediaFromIdsWithoutUploading() {
        UUID sellerId = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setSellerId(sellerId);
        existing.setStatus(ListingStatus.ACTIVE);
        when(listings.findById(listingId)).thenReturn(java.util.Optional.of(existing));
        when(attributeValidator.validate(any())).thenReturn(Map.of("platform", "MOBILE"));
        when(persistence.saveWithCardInventory(existing)).thenReturn(existing);

        Listing saved = service.updateContent(listingId, sellerId,
                new uz.efbazaar.marketplace.dto.ListingUpdateRequest(
                        "yangi tavsif matni", null, null, Map.of("platform", "MOBILE")),
                List.of("msg-7"));

        assertThat(saved.getMediaMessageIds()).containsExactly("msg-7");
        verify(mediaService, never()).uploadToBot(any(), any(), any());
        verify(events).listingUpdated(existing);
    }

    @Test
    void createWithUploadedMedia_skipsUploadAndKeepsTheGivenMessageIds() {
        UUID sellerId = UUID.randomUUID();
        ListingCreateRequest request = new ListingCreateRequest(
                "tavsif matni", new BigDecimal("2400000"), false, Map.of("platform", "MOBILE"), null);
        Listing entity = new Listing();
        when(mapper.toEntity(request)).thenReturn(entity);
        when(attributeValidator.validate(request.attributes())).thenReturn(Map.of("platform", "MOBILE"));
        when(persistence.saveWithCardInventory(entity)).thenReturn(entity);

        Listing saved = service.createWithUploadedMedia(sellerId, request, List.of("msg-1", "msg-2"));

        assertThat(saved.getMediaMessageIds()).containsExactly("msg-1", "msg-2");
        assertThat(saved.getSellerId()).isEqualTo(sellerId);
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ACTIVE);
        verify(mediaService, never()).uploadToBot(any(), any(), any());
        verify(mediaService, never()).validate(any());
        verify(officialChannel).onListingCreated(entity);
        verify(events).listingCreated(entity);
    }
}
