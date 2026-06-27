package uz.efbazaar.auth.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.auth.domain.User;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByTelegramId(Long telegramId);

    Optional<User> findByGoogleId(String googleId);

    boolean existsByGoogleId(String googleId);
}
