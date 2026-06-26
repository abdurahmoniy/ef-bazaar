package uz.efbazaar.auth.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.auth.domain.User;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    Optional<User> findByUsernameOrEmail(String username, String email);

    Optional<User> findByTelegramId(Long telegramId);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    boolean existsByTelegramId(Long telegramId);
}
