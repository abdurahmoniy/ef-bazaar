package uz.efbazaar.auth.service;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import uz.efbazaar.auth.domain.Role;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.TermsAcceptanceRequest;
import uz.efbazaar.auth.event.AuthEventPublisher;
import uz.efbazaar.auth.mapper.UserMapperImpl;
import uz.efbazaar.auth.repository.UserRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Oferta va maxfiylik siyosatiga rozilik: qaysi versiyaga va qachon rozi
 * bo'lgani saqlanadi, shunda hujjat o'zgarsa qayta so'rash mumkin bo'ladi.
 */
class TermsAcceptanceTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final UserService userService = new UserService(userRepository, mock(AuthEventPublisher.class));
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void recordsAcceptedVersionAndTime() {
        UUID id = UUID.randomUUID();
        User user = User.builder().id(id).role(Role.USER).build();
        when(userRepository.findById(id)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        Instant before = Instant.now();

        User result = userService.acceptTerms(id, "2026-11-10");

        assertThat(result.getTermsVersion()).isEqualTo("2026-11-10");
        assertThat(result.getTermsAcceptedAt()).isAfterOrEqualTo(before);
        verify(userRepository).save(user);
    }

    @Test
    void repeatedAcceptanceOfSameVersionKeepsOriginalTime() {
        UUID id = UUID.randomUUID();
        Instant original = Instant.parse("2026-11-10T08:00:00Z");
        User user = User.builder().id(id).role(Role.USER)
                .termsVersion("2026-11-10").termsAcceptedAt(original).build();
        when(userRepository.findById(id)).thenReturn(Optional.of(user));

        User result = userService.acceptTerms(id, "2026-11-10");

        assertThat(result.getTermsAcceptedAt()).isEqualTo(original);
        verify(userRepository, never()).save(any());
    }

    @Test
    void newerVersionReplacesTheOldConsent() {
        UUID id = UUID.randomUUID();
        User user = User.builder().id(id).role(Role.USER)
                .termsVersion("2026-11-10").termsAcceptedAt(Instant.parse("2026-11-10T08:00:00Z")).build();
        when(userRepository.findById(id)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User result = userService.acceptTerms(id, "2027-01-15");

        assertThat(result.getTermsVersion()).isEqualTo("2027-01-15");
        assertThat(result.getTermsAcceptedAt()).isAfter(Instant.parse("2026-11-10T08:00:00Z"));
    }

    @Test
    void versionMustBeADate() {
        assertThat(validator.validate(new TermsAcceptanceRequest("2026-11-10"))).isEmpty();
        assertThat(validator.validate(new TermsAcceptanceRequest("latest"))).isNotEmpty();
        assertThat(validator.validate(new TermsAcceptanceRequest(""))).isNotEmpty();
        assertThat(validator.validate(new TermsAcceptanceRequest(null))).isNotEmpty();
    }

    @Test
    void meResponseCarriesTheAcceptedVersion() {
        Instant at = Instant.parse("2026-11-10T08:00:00Z");
        User user = User.builder().id(UUID.randomUUID()).role(Role.USER).telegramId(1L)
                .termsVersion("2026-11-10").termsAcceptedAt(at).build();

        var response = new UserMapperImpl().toResponse(user);

        assertThat(response.termsVersion()).isEqualTo("2026-11-10");
        assertThat(response.termsAcceptedAt()).isEqualTo(at);
    }
}
