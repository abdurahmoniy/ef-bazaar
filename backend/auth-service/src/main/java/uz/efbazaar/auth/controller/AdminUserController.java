package uz.efbazaar.auth.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.PageResponse;
import uz.efbazaar.auth.dto.UpdateRoleRequest;
import uz.efbazaar.auth.dto.UserResponse;
import uz.efbazaar.auth.mapper.UserMapper;
import uz.efbazaar.auth.security.AuthenticatedUser;
import uz.efbazaar.auth.service.UserService;

import java.util.List;
import java.util.UUID;

/**
 * User moderation for the admin panel. Gated by {@code ROLE_ADMIN} in
 * {@link uz.efbazaar.auth.config.SecurityConfig}. Self-targeting mutations are
 * rejected in {@link UserService} so an admin can't demote or delete themselves.
 */
@RestController
@RequestMapping("/api/v1/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final UserService userService;
    private final UserMapper userMapper;

    /**
     * @param telegramOnly faqat Telegramga ulanganlarni qaytaradi — botdan
     *                     maxsus xabar yuborish uchun manzil tanlanayotganda.
     *                     Ulanmagan foydalanuvchini ko'rsatish foydasiz: uni
     *                     tanlab bo'lardi, xabar esa yetmasdi.
     */
    @GetMapping
    public PageResponse<UserResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false, defaultValue = "false") boolean telegramOnly,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Page<User> page = userService.findAll(search, telegramOnly, pageable);
        return new PageResponse<>(
                page.getContent().stream().map(userMapper::toResponse).toList(),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }

    /**
     * Bulk lookup by id. The admin panel joins rows owned by other services
     * (e.g. trade-service mailboxes, which store only {@code owner_user_id})
     * back to a display name — without this it would have to fetch the whole
     * user page and hope the owners are on it.
     *
     * <p>Unknown ids are skipped, not errors: a mailbox can outlive the user
     * that owned it, and the panel renders those as "deleted user".
     */
    @GetMapping("/by-ids")
    public List<UserResponse> byIds(@RequestParam List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return userService.findAllByIds(ids).stream().map(userMapper::toResponse).toList();
    }

    @PutMapping("/{id}/role")
    public UserResponse changeRole(@AuthenticationPrincipal AuthenticatedUser admin,
                                   @PathVariable UUID id,
                                   @Valid @RequestBody UpdateRoleRequest request) {
        return userMapper.toResponse(userService.changeRole(admin.userId(), id, request.role()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser admin,
                       @PathVariable UUID id) {
        userService.deleteByAdmin(admin.userId(), id);
    }
}
