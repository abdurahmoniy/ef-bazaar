package uz.efbazaar.auth.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserResponse;

@Mapper(componentModel = "spring")
public interface UserMapper {

    @Mapping(target = "verified", expression = "java(user.isVerified())")
    UserResponse toResponse(User user);
}
