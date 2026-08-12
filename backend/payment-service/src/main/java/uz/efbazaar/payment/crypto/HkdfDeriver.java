package uz.efbazaar.payment.crypto;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.util.Arrays;

/**
 * RFC 5869 HKDF-SHA256.
 * Single static helper because we never keep hkdf state around.
 */
public final class HkdfDeriver {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final byte[] EMPTY_SALT = new byte[32];

    private HkdfDeriver() {
    }

    public static byte[] derive(byte[] inputKeyMaterial, byte[] info, int length) {
        if (length <= 0 || length > 255 * 32) {
            throw new IllegalArgumentException("length must be in (0, 8160]");
        }
        try {
            byte[] prk = hmac(EMPTY_SALT, inputKeyMaterial);

            int n = (length + 31) / 32;
            ByteBuffer okm = ByteBuffer.allocate(n * 32);
            byte[] t = new byte[0];
            for (int i = 1; i <= n; i++) {
                Mac mac = Mac.getInstance(HMAC_SHA256);
                mac.init(new SecretKeySpec(prk, HMAC_SHA256));
                mac.update(t);
                mac.update(info);
                mac.update((byte) i);
                t = mac.doFinal();
                okm.put(t);
            }
            return Arrays.copyOf(okm.array(), length);
        } catch (Exception e) {
            throw new IllegalStateException("HKDF derivation failed", e);
        }
    }

    private static byte[] hmac(byte[] key, byte[] data) throws Exception {
        Mac mac = Mac.getInstance(HMAC_SHA256);
        mac.init(new SecretKeySpec(key, HMAC_SHA256));
        return mac.doFinal(data);
    }
}
