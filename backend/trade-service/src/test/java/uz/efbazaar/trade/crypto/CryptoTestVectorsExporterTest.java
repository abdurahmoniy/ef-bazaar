package uz.efbazaar.trade.crypto;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * Emits a JSON file the Python FieldEncryptor tests round-trip. Running this
 * test writes {@code smart-admin-worker/tests/fixtures/crypto_vectors.json}.
 *
 * <p>Regenerate whenever HkdfDeriver or TradeCrypto changes semantics.
 */
class CryptoTestVectorsExporterTest {

    private static final byte[] MASTER = new byte[]{
            0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,
            0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b,0x0b
    };

    @Test
    void emitVectors() throws Exception {
        TradeCrypto crypto = new TradeCrypto(() -> MASTER.clone());

        var vectors = List.of(
                vector(crypto, "mbox-abc", "hello world"),
                vector(crypto, "mbox-xyz", "SuperSecret-Password_42"),
                vector(crypto, "msg-11111111-1111-1111-1111-111111111111-22222222-2222-2222-2222-222222222222",
                        "Bir marotaba ochiladigan Konami paroli 🤐")
        );

        Map<String, Object> body = Map.of(
                "masterKeyBase64", Base64.getEncoder().encodeToString(MASTER),
                "vectors", vectors
        );

        Path out = Path.of("../../smart-admin-worker/tests/fixtures/crypto_vectors.json").toAbsolutePath().normalize();
        Files.createDirectories(out.getParent());
        ObjectMapper json = new ObjectMapper();
        json.enable(SerializationFeature.INDENT_OUTPUT);
        Files.writeString(out, json.writeValueAsString(body));
        System.out.println("wrote " + out);
    }

    private static Map<String, String> vector(TradeCrypto crypto, String context, String plaintext) {
        byte[] pt = plaintext.getBytes(StandardCharsets.UTF_8);
        EncryptedField enc = crypto.encrypt(context, pt);
        return Map.of(
                "context", context,
                "plaintextBase64", Base64.getEncoder().encodeToString(pt),
                "ivBase64", Base64.getEncoder().encodeToString(enc.iv()),
                "tagBase64", Base64.getEncoder().encodeToString(enc.tag()),
                "ciphertextBase64", Base64.getEncoder().encodeToString(enc.ciphertext())
        );
    }
}
