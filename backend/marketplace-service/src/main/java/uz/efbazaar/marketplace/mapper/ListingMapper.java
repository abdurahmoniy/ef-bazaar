package uz.efbazaar.marketplace.mapper;

import org.mapstruct.*;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingResponse;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;

@Mapper(componentModel = "spring", nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface ListingMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "sellerId", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "forwardCount", ignore = true)
    @Mapping(target = "mediaMessageIds", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    Listing toEntity(ListingCreateRequest request);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "sellerId", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "forwardCount", ignore = true)
    @Mapping(target = "mediaMessageIds", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    void update(@MappingTarget Listing target, ListingUpdateRequest request);

    @Mapping(target = "likeCount", ignore = true)
    @Mapping(target = "likedByMe", ignore = true)
    ListingResponse toResponse(Listing listing);
}
