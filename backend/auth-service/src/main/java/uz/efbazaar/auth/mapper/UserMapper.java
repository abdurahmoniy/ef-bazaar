package uz.efbazaar.auth.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserResponse;

@Mapper(componentModel = "spring")
public interface UserMapper {

    /**
     * {@code telegramPhotoUrl} response field doim browser'dan ko'rinadigan nginx
     * route'iga ({@code /api/auth/v1/users/me/photo}) yo'naltiradi — backend o'zi
     * qaror qiladi: direct Telegram CDN URL'ga 302 yoki Bot API'dan stream.
     * Frontend faqat shu URL'ni biladi. Hech qaysi manba yo'q bo'lsa — {@code null},
     * frontend initial fallback ko'rsatadi.
     */
    @Mapping(target = "displayName", expression = "java(user.displayName())")
    @Mapping(target = "googleLinked", expression = "java(user.getGoogleId() != null)")
    @Mapping(target = "roles", expression = "java(java.util.List.of(\"ROLE_\" + user.getRole().name()))")
    @Mapping(target = "telegramPhotoUrl", expression = "java(hasPhotoSource(user) ? \"/api/auth/v1/users/me/photo\" : null)")
    UserResponse toResponse(User user);

    default boolean hasPhotoSource(User user) {
        return (user.getTelegramPhotoUrl() != null && !user.getTelegramPhotoUrl().isBlank())
                || (user.getTelegramPhotoFileId() != null && !user.getTelegramPhotoFileId().isBlank());
    }
}
