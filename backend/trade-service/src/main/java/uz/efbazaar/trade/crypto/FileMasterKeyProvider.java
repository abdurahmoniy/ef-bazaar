package uz.efbazaar.trade.crypto;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

/**
 * Reads the 32-byte master key from the file referenced by MASTER_KEY_FILE.
 * File contents: base64-encoded 32 raw bytes on one line (trailing whitespace tolerated).
 */
@Slf4j
@Component
public class FileMasterKeyProvider implements MasterKeyProvider {

    private final byte[] key;

    public FileMasterKeyProvider(@Value("${trade.crypto.master-key-file:#{null}}") String masterKeyFile) {
        if (masterKeyFile == null || masterKeyFile.isBlank()) {
            throw new IllegalStateException(
                    "trade.crypto.master-key-file (or MASTER_KEY_FILE env) must be set");
        }
        try {
            String content = Files.readString(Path.of(masterKeyFile)).trim();
            byte[] decoded = Base64.getDecoder().decode(content);
            if (decoded.length != 32) {
                throw new IllegalStateException(
                        "master key must decode to 32 bytes, got " + decoded.length);
            }
            this.key = decoded;
            log.info("Master key loaded from {}", masterKeyFile);
        } catch (Exception e) {
            throw new IllegalStateException(
                    "Failed to load master key from " + masterKeyFile, e);
        }
    }

    @Override
    public byte[] masterKey() {
        return key.clone();
    }
}
