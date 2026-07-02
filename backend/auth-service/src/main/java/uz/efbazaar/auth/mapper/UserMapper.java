package uz.efbazaar.auth.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserResponse;

@Mapper(componentModel = "spring")
public interface UserMapper {

    /**
     * {@code telegramPhotoUrl} response field faqat bot media topic'ga rasm upload
     * qilib olgan bo'lsagina proxy URL ({@code /api/auth/v1/users/me/photo}) qaytaradi.
     *
     * <p>Login Widget'dan kelgan xom {@code t.me/i/userpic} URL'lariga tayanmaymiz —
     * Telegram ularni vaqt o'tishi bilan cache-bust qilib 404 qaytaradigan qilib
     * qo'yadi. Bot esa {@code getUserProfilePhotos}'ni faqat Telegram user privacy'si
     * yo'l qo'ysa yoki user bot bilan chat boshlagan bo'lsagina rasm qaytaradi;
     * ikkalasi ham bo'lmasa {@code file_id} yo'q va bu yerda {@code null} qaytariladi
     * — frontend Radix Avatar initials fallback'ini ko'rsatadi (buzuq rasm ikonisiz).
     */
    @Mapping(target = "displayName", expression = "java(user.displayName())")
    @Mapping(target = "telegramLinked", expression = "java(user.getTelegramId() != null)")
    @Mapping(target = "googleLinked", expression = "java(user.getGoogleId() != null)")
    @Mapping(target = "verified", expression = "java(user.verified())")
    @Mapping(target = "roles", expression = "java(java.util.List.of(\"ROLE_\" + user.getRole().name()))")
    @Mapping(target = "telegramPhotoUrl", expression = "java(hasReliablePhoto(user) ? \"/api/auth/v1/users/me/photo\" : null)")
    UserResponse toResponse(User user);

    default boolean hasReliablePhoto(User user) {
        return user.getTelegramPhotoFileId() != null && !user.getTelegramPhotoFileId().isBlank();
    }
}
