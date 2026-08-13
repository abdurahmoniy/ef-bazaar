package uz.efbazaar.payment.crypto;

/**
 * At-rest encryption bundle. All three fields go into DB columns of the owning entity.
 * The tag is authenticated by GCM but stored separately from the ciphertext to keep the
 * DB column contract explicit (some DB tooling truncates unknown suffixes on BYTEA).
 */
public record EncryptedField(byte[] iv, byte[] tag, byte[] ciphertext) {
    public EncryptedField {
        if (iv == null || iv.length != 12) {
            throw new IllegalArgumentException("iv must be 12 bytes");
        }
        if (tag == null || tag.length != 16) {
            throw new IllegalArgumentException("tag must be 16 bytes");
        }
        if (ciphertext == null) {
            throw new IllegalArgumentException("ciphertext must be non-null");
        }
    }
}
