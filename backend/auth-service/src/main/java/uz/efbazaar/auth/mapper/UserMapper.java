package uz.efbazaar.auth.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserResponse;

@Mapper(componentModel = "spring")
public interface UserMapper {

    @Mapping(target = "displayName", expression = "java(user.displayName())")
    @Mapping(target = "googleLinked", expression = "java(user.getGoogleId() != null)")
    @Mapping(target = "roles", expression = "java(java.util.List.of(\"ROLE_\" + user.getRole().name()))")
    UserResponse toResponse(User user);
}
