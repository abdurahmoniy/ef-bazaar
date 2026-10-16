package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.Optional;
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
        return findAll(search, false, pageable);
    }

    /**
     * Admin qidiruvi.
     *
     * <p>So'rov RAQAM bo'lsa Telegram chat id, UUID bo'lsa platforma id si
     * deb qaraladi va aniq moslik izlanadi. Bu ikkisi matnli qidiruvga
     * qo'shilmaydi: ular butun qiymat sifatida beriladi, `LIKE '%...%'`
     * esa ular ustidagi indeksni ishlatmasdi va yarim raqam bo'yicha
     * tasodifiy mosliklar chiqarardi.
     *
     * @param telegramOnly faqat Telegramga ulanganlar (botga xabar
     *                     yuborish uchun manzil tanlanayotganda)
     */
    @Transactional(readOnly = true)
    public Page<User> findAll(String search, boolean telegramOnly, Pageable pageable) {
        if (search == null || search.isBlank()) {
            return telegramOnly
                    ? userRepository.findByTelegramIdNotNull(pageable)
                    : userRepository.findAll(pageable);
        }
        String query = search.trim();
        // "@ali_v" is how a Telegram username is usually written.
        if (query.startsWith("@")) query = query.substring(1).trim();
        if (query.isEmpty()) return Page.empty(pageable);

        Optional<User> exact = findByIdentifier(query);
        if (exact.isPresent()) {
            User user = exact.get();
            if (telegramOnly && user.getTelegramId() == null) {
                return Page.empty(pageable);
            }
            return new PageImpl<>(List.of(user), pageable, 1);
        }

        String[] words = query.toLowerCase(java.util.Locale.ROOT).split("\\s+");
        if (words.length > 1) {
            return searchAllWords(words, telegramOnly, pageable);
        }
        return telegramOnly
                ? userRepository.searchWithTelegram(query, pageable)
                : userRepository.search(query, pageable);
    }

    /** How many candidates a multi-word search looks through. */
    private static final int MULTI_WORD_CANDIDATES = 200;

    /**
     * "Ali Valiyev": every word must appear somewhere in the person's names,
     * username or email, in any order. The database is asked for the most
     * selective word (the longest); the rest are matched here.
     */
    private Page<User> searchAllWords(String[] words, boolean telegramOnly, Pageable pageable) {
        String longest = java.util.Arrays.stream(words)
                .max(java.util.Comparator.comparingInt(String::length)).orElseThrow();
        Pageable candidates = org.springframework.data.domain.PageRequest.of(0, MULTI_WORD_CANDIDATES, pageable.getSort());
        List<User> pool = (telegramOnly
                ? userRepository.searchWithTelegram(longest, candidates)
                : userRepository.search(longest, candidates)).getContent();
        List<User> matching = pool.stream()
                .filter(u -> {
                    String haystack = searchableText(u);
                    return java.util.Arrays.stream(words).allMatch(haystack::contains);
                })
                .toList();
        int from = (int) Math.min(pageable.getOffset(), matching.size());
        int to = Math.min(from + pageable.getPageSize(), matching.size());
        return new PageImpl<>(matching.subList(from, to), pageable, matching.size());
    }

    private static String searchableText(User u) {
        return java.util.stream.Stream.of(u.getTelegramFirstName(), u.getTelegramLastName(),
                        u.getTelegramUsername(), u.getGoogleGivenName(), u.getEmail())
                .filter(java.util.Objects::nonNull)
                .map(v -> v.toLowerCase(java.util.Locale.ROOT))
                .collect(java.util.stream.Collectors.joining(" "));
    }

    /** Butun son — Telegram chat id, UUID — platforma id si. Boshqasi: bo'sh. */
    private Optional<User> findByIdentifier(String query) {
        if (query.matches("\\d{5,}")) {
            try {
                return userRepository.findByTelegramId(Long.parseLong(query));
            } catch (NumberFormatException e) {
                return Optional.empty();
            }
        }
        try {
            return userRepository.findById(UUID.fromString(query));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
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
