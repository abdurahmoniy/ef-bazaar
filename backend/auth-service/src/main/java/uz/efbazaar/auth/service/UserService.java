package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;

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
}
