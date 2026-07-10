package uz.efbazaar.trade.crypto;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TradeCryptoTest {

    private TradeCrypto crypto;

    @BeforeEach
    void setUp() {
        byte[] master = new byte[32];
        new SecureRandom().nextBytes(master);
        crypto = new TradeCrypto(() -> master);
    }

    @Test
    void roundTripPlaintext() {
        byte[] plaintext = "hello world".getBytes(StandardCharsets.UTF_8);
        EncryptedField enc = crypto.encrypt("mbox-abc", plaintext);
        byte[] out = crypto.decrypt("mbox-abc", enc);
        assertThat(new String(out, StandardCharsets.UTF_8)).isEqualTo("hello world");
    }

    @Test
    void differentContextsProduceDifferentCiphertext() {
        byte[] plaintext = "same input".getBytes(StandardCharsets.UTF_8);
        EncryptedField a = crypto.encrypt("mbox-abc", plaintext);
        EncryptedField b = crypto.encrypt("mbox-xyz", plaintext);
        assertThat(a.ciphertext()).isNotEqualTo(b.ciphertext());
    }

    @Test
    void decryptWithWrongContextFails() {
        byte[] plaintext = "top secret".getBytes(StandardCharsets.UTF_8);
        EncryptedField enc = crypto.encrypt("mbox-abc", plaintext);
        assertThatThrownBy(() -> crypto.decrypt("mbox-xyz", enc))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void tamperingWithCiphertextFails() {
        byte[] plaintext = "top secret".getBytes(StandardCharsets.UTF_8);
        EncryptedField enc = crypto.encrypt("mbox-abc", plaintext);
        byte[] tampered = enc.ciphertext().clone();
        tampered[0] ^= 0x01;
        EncryptedField bad = new EncryptedField(enc.iv(), enc.tag(), tampered);
        assertThatThrownBy(() -> crypto.decrypt("mbox-abc", bad))
                .isInstanceOf(IllegalStateException.class);
    }
}
