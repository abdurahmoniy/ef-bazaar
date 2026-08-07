package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final AuthEventPublisher events;

    @Transactional(readOnly = true)
    public User getById(UUID id) {
        return userRepository.findById(id).orElseThrow(AuthException::userNotFound);
    }

    /**
     * Hard-delete the caller's account. The row leaves the DB entirely so the
     * {@code telegram_id} / {@code google_id} unique constraints do not block a
     * later fresh signup with the same identity. Access tokens live until they
     * expire (max 15 min); refresh attempts fail because the user no longer
     * exists in DB. The {@code user-deleted} event lets marketplace-service and
     * bot purge downstream state (listings, cart, chats, cached avatars).
     */
    @Transactional
    public void deleteById(UUID id) {
        User user = userRepository.findById(id).orElseThrow(AuthException::userNotFound);
        Long telegramId = user.getTelegramId();
        String email = user.getEmail();
        userRepository.delete(user);
        events.userDeleted(id, telegramId, email);
        log.info("User deleted: id={} telegramId={} email={}", id, telegramId, email);
    }

    // ---------- Admin moderation ----------

    /** Bulk id lookup for cross-service joins; unknown ids are simply absent. */
    @Transactional(readOnly = true)
    public List<User> findAllByIds(Collection<UUID> ids) {
        return userRepository.findAllById(ids);
    }

    @Transactional(readOnly = true)
    public Page<User> findAll(String search, Pageable pageable) {
        if (search == null || search.isBlank()) {
            return userRepository.findAll(pageable);
        }
        return userRepository.search(search.trim(), pageable);
    }

    /**
     * Change a user's role. Self-targeting is rejected so an admin cannot demote
     * themselves and lock everyone out of the panel by accident. Existing access
     * tokens keep their old roles claim until they expire (max 15 min).
     *
     * <p>A no-op (requested role equals current role) saves nothing and publishes
     * nothing — a spurious {@code user-role-changed} event would make trade-service
     * deactivate an admin catalogue profile for no reason.
     */
    @Transactional
    public User changeRole(UUID adminId, UUID targetId, Role role) {
        if (adminId.equals(targetId)) {
            throw AuthException.cannotModifySelf();
        }
        User user = userRepository.findById(targetId).orElseThrow(AuthException::userNotFound);
        Role oldRole = user.getRole();
        if (oldRole == role) {
            return user;
        }
        user.setRole(role);
        User saved = userRepository.save(user);
        events.userRoleChanged(targetId, oldRole, role);
        log.info("User role changed: id={} role={} adminId={}", targetId, role, adminId);
        return saved;
    }

    /** Hard-delete on behalf of an admin — same downstream purge as {@link #deleteById}. */
    @Transactional
    public void deleteByAdmin(UUID adminId, UUID targetId) {
        if (adminId.equals(targetId)) {
            throw AuthException.cannotModifySelf();
        }
        deleteById(targetId);
    }
}
