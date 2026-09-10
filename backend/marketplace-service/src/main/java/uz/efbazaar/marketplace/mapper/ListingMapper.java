package uz.efbazaar.marketplace.mapper;

import org.mapstruct.*;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingResponse;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;

/**
 * Attributes are intentionally NOT mapped here — the service layer runs them
 * through {@link uz.efbazaar.marketplace.service.AttributeValidator} first and
 * sets the normalized map explicitly. Everything else maps by field name.
 */
@Mapper(componentModel = "spring", nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface ListingMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "sellerId", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "forwardCount", ignore = true)
    @Mapping(target = "viewCount", ignore = true)
    @Mapping(target = "mediaMessageIds", ignore = true)
    @Mapping(target = "attributes", ignore = true)
    @Mapping(target = "soldAt", ignore = true)
    @Mapping(target = "soldToUserId", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    Listing toEntity(ListingCreateRequest request);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "sellerId", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "forwardCount", ignore = true)
    @Mapping(target = "viewCount", ignore = true)
    @Mapping(target = "mediaMessageIds", ignore = true)
    @Mapping(target = "attributes", ignore = true)
    @Mapping(target = "soldAt", ignore = true)
    @Mapping(target = "soldToUserId", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    void update(@MappingTarget Listing target, ListingUpdateRequest request);

    @Mapping(target = "likeCount", ignore = true)
    @Mapping(target = "likedByMe", ignore = true)
    @Mapping(target = "seller", ignore = true)
    ListingResponse toResponse(Listing listing);
}
