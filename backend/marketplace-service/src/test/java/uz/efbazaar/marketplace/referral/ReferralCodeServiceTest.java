package uz.efbazaar.marketplace.referral;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.referral.ReferralRepositories.ReferralCodeRepository;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Kod berish va yechish.
 *
 * <p>Bu yerdagi xato jimgina zarar keltiradi: takroriy kod ikki odamning
 * referalini aralashtiradi, taxmin qilinadigan kod esa birovning nomidan
 * taklif qilishga imkon beradi. Ikkalasi ham ishlab turgandek ko'rinadi.
 */
class ReferralCodeServiceTest {

    private ReferralCodeRepository codes;
    private ReferralCodeService service;
    private Map<UUID, ReferralCode> stored;

    @BeforeEach
    void setUp() {
        codes = mock(ReferralCodeRepository.class);
        stored = new HashMap<>();
        when(codes.findById(any())).thenAnswer(i -> Optional.ofNullable(stored.get(i.getArgument(0))));
        when(codes.save(any(ReferralCode.class))).thenAnswer(i -> {
            ReferralCode c = i.getArgument(0);
            stored.put(c.getUserId(), c);
            return c;
        });
        when(codes.existsByCode(anyString())).thenReturn(false);
        service = new ReferralCodeService(codes);
    }

    @Test
    @DisplayName("the same user always gets the same code")
    void stableCode() {
        UUID user = UUID.randomUUID();
        assertThat(service.codeFor(user)).isEqualTo(service.codeFor(user));
    }

    @Test
    @DisplayName("different users get different codes")
    void distinctCodes() {
        assertThat(service.codeFor(UUID.randomUUID()))
                .isNotEqualTo(service.codeFor(UUID.randomUUID()));
    }

    @Test
    @DisplayName("a code is not derived from the user id")
    void codeIsNotGuessable() {
        UUID user = UUID.randomUUID();
        String code = service.codeFor(user);
        assertThat(user.toString().replace("-", "").toUpperCase()).doesNotContain(code);
    }

    @Test
    @DisplayName("a code matches the shape the browser and the bot both validate")
    void codeShape() {
        // referral-capture.ts va UpdateHandler.startPayload ikkalasi ham
        // shu shaklni tekshiradi. Shakl o'zgarsa uch joyda o'zgarishi kerak,
        // va bu sinov o'shani eslatib turadi.
        assertThat(service.codeFor(UUID.randomUUID())).matches("^[A-Z0-9]{8}$");
    }

    @Test
    @DisplayName("a taken code is retried rather than issued twice")
    void retriesOnCollision() {
        when(codes.existsByCode(anyString())).thenReturn(true, false);
        assertThat(service.codeFor(UUID.randomUUID())).isNotBlank();
    }

    @Test
    @DisplayName("a known code resolves to its owner")
    void resolvesOwner() {
        UUID owner = UUID.randomUUID();
        when(codes.findByCode("ABCD2345")).thenReturn(Optional.of(new ReferralCode(owner, "ABCD2345")));

        assertThat(service.resolve("ABCD2345")).contains(owner);
    }

    @Test
    @DisplayName("resolving is case- and whitespace-forgiving")
    void resolveNormalises() {
        UUID owner = UUID.randomUUID();
        when(codes.findByCode("ABCD2345")).thenReturn(Optional.of(new ReferralCode(owner, "ABCD2345")));

        // Kod og'zaki uzatiladi va qo'lda teriladi — kichik harf yoki
        // ortiqcha bo'sh joy uchun referalni yo'qotish sababsiz.
        assertThat(service.resolve("  abcd2345 ")).contains(owner);
    }

    @Test
    @DisplayName("an unknown or empty code resolves to nothing, without throwing")
    void unknownCode() {
        when(codes.findByCode(anyString())).thenReturn(Optional.empty());

        assertThat(service.resolve("NOSUCH11")).isEmpty();
        assertThat(service.resolve("")).isEmpty();
        assertThat(service.resolve(null)).isEmpty();
    }
}
