package uz.efbazaar.trade.crypto;

import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;

/**
 * AES-256-GCM with HKDF-derived per-record keys.
 *
 * Context is any short string identifying the record (e.g. "card-{uuid}",
 * "mbox-{uuid}"). Same context is required at decrypt time — a wrong context
 * derives a different key and GCM authentication fails.
 */
@Component
public class TradeCrypto {

    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_IV_BYTES = 12;

    private final MasterKeyProvider provider;
    private final SecureRandom random;

    public TradeCrypto(MasterKeyProvider provider) {
        this.provider = provider;
        this.random = new SecureRandom();
    }

    public EncryptedField encrypt(String context, byte[] plaintext) {
        try {
            byte[] key = HkdfDeriver.derive(
                    provider.masterKey(),
                    context.getBytes(StandardCharsets.UTF_8),
                    32);
            byte[] iv = new byte[GCM_IV_BYTES];
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] cipherAndTag = cipher.doFinal(plaintext);

            byte[] ciphertext = Arrays.copyOfRange(cipherAndTag, 0, cipherAndTag.length - 16);
            byte[] tag = Arrays.copyOfRange(cipherAndTag, cipherAndTag.length - 16, cipherAndTag.length);
            return new EncryptedField(iv, tag, ciphertext);
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM encryption failed", e);
        }
    }

    public byte[] decrypt(String context, EncryptedField field) {
        try {
            byte[] key = HkdfDeriver.derive(
                    provider.masterKey(),
                    context.getBytes(StandardCharsets.UTF_8),
                    32);
            byte[] cipherAndTag = new byte[field.ciphertext().length + field.tag().length];
            System.arraycopy(field.ciphertext(), 0, cipherAndTag, 0, field.ciphertext().length);
            System.arraycopy(field.tag(), 0, cipherAndTag, field.ciphertext().length, field.tag().length);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, field.iv()));
            return cipher.doFinal(cipherAndTag);
        } catch (Exception e) {
            throw new IllegalStateException("AES-GCM decryption failed", e);
        }
    }
}
