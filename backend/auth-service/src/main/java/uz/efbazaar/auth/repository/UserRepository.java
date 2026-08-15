package uz.efbazaar.auth.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import uz.efbazaar.auth.domain.User;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByTelegramId(Long telegramId);

    List<User> findByTelegramIdIn(Collection<Long> telegramIds);

    Optional<User> findByGoogleId(String googleId);

    /**
     * Everyone holding a role, for services that need to reach a group rather
     * than a person — a payout waiting for whoever is on duty, say.
     */
    List<User> findByRole(uz.efbazaar.auth.domain.Role role);

    boolean existsByGoogleId(String googleId);

    /** Case-insensitive contains-search over the admin-visible identity fields. */
    @Query("""
            SELECT u FROM User u
             WHERE lower(u.telegramUsername) LIKE lower(concat('%', :q, '%'))
                OR lower(u.telegramFirstName) LIKE lower(concat('%', :q, '%'))
                OR lower(u.telegramLastName) LIKE lower(concat('%', :q, '%'))
                OR lower(u.email) LIKE lower(concat('%', :q, '%'))
            """)
    Page<User> search(@Param("q") String q, Pageable pageable);
}
