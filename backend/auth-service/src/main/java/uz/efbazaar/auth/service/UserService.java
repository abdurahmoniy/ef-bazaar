package uz.efbazaar.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.RegisterRequest;
import uz.efbazaar.auth.dto.TelegramLinkRequest;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.exception.AuthException;
import uz.efbazaar.auth.repository.UserRepository;
import uz.efbazaar.auth.security.TelegramLoginValidator;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final TelegramLoginValidator telegramValidator;
    private final AuthEventPublisher events;

    @Transactional
    public User register(RegisterRequest request) {
        String username = request.username().trim();
        String email = request.email().trim().toLowerCase();

        if (userRepository.existsByUsername(username)) {
            throw AuthException.usernameTaken();
        }
        if (userRepository.existsByEmail(email)) {
            throw AuthException.emailTaken();
        }

        User user = User.builder()
                .username(username)
                .email(email)
                .passwordHash(passwordEncoder.encode(request.password()))
                .role(Role.USER)
                .build();
        user = userRepository.save(user);

        events.userRegistered(user.getId(), user.getUsername(), user.getEmail());
        log.info("User registered: id={} username={}", user.getId(), user.getUsername());
        return user;
    }

    @Transactional(readOnly = true)
    public User authenticate(String usernameOrEmail, String rawPassword) {
        String identifier = usernameOrEmail.trim();
        String normalizedEmail = identifier.toLowerCase();
        User user = userRepository.findByUsernameOrEmail(identifier, normalizedEmail)
                .orElseThrow(AuthException::invalidCredentials);

        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            throw AuthException.invalidCredentials();
        }
        return user;
    }

    @Transactional(readOnly = true)
    public User getById(UUID id) {
        return userRepository.findById(id).orElseThrow(AuthException::userNotFound);
    }

    @Transactional
    public User linkTelegram(UUID userId, TelegramLinkRequest request) {
        if (!telegramValidator.isValid(request.toPayload())) {
            throw AuthException.invalidTelegramHash();
        }

        User user = getById(userId);

        userRepository.findByTelegramId(request.id()).ifPresent(other -> {
            if (!other.getId().equals(userId)) {
                throw AuthException.telegramAlreadyLinked();
            }
        });

        user.setTelegramId(request.id());
        user.setTelegramUsername(request.username());
        user.setTelegramFirstName(request.firstName());
        user.setTelegramLastName(request.lastName());
        user.setTelegramPhotoUrl(request.photoUrl());

        events.telegramLinked(user.getId(), request.id());
        log.info("Telegram linked: userId={} telegramId={}", user.getId(), request.id());
        return user;
    }
}
