package uz.efbazaar.trade.crypto;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

class HkdfDeriverTest {

    private static final byte[] MASTER = HexFormat.of()
            .parseHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");

    @Test
    void derivesReproducibleKey() {
        byte[] k1 = HkdfDeriver.derive(MASTER, "card-abc".getBytes(StandardCharsets.UTF_8), 32);
        byte[] k2 = HkdfDeriver.derive(MASTER, "card-abc".getBytes(StandardCharsets.UTF_8), 32);
        assertThat(k1).isEqualTo(k2);
        assertThat(k1).hasSize(32);
    }

    @Test
    void differentContextsProduceDifferentKeys() {
        byte[] k1 = HkdfDeriver.derive(MASTER, "card-abc".getBytes(StandardCharsets.UTF_8), 32);
        byte[] k2 = HkdfDeriver.derive(MASTER, "card-xyz".getBytes(StandardCharsets.UTF_8), 32);
        assertThat(k1).isNotEqualTo(k2);
    }
}
