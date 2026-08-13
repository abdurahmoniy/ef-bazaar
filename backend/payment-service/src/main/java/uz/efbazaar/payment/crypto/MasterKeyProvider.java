package uz.efbazaar.payment.crypto;

/**
 * Source of the 32-byte master key used to derive per-record encryption keys.
 * Being an interface lets tests pass a lambda without depending on the
 * file-backed implementation used in production.
 */
@FunctionalInterface
public interface MasterKeyProvider {

    /**
     * @return the 32-byte master key. Implementations should return a
     *         defensive copy — callers may retain the reference.
     */
    byte[] masterKey();
}
