package uz.efbazaar.outbox.internal;

import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HeaderCodecTest {

    @Test
    void roundTripsNamesValuesOrderAndDuplicates() {
        RecordHeaders headers = new RecordHeaders();
        headers.add("__TypeId__", "uz.efbazaar.X".getBytes(StandardCharsets.UTF_8));
        headers.add("dup", new byte[]{1, 2});
        headers.add("dup", new byte[]{3});
        headers.add("nullValue", null);

        List<Header> back = HeaderCodec.fromJson(HeaderCodec.toJson(headers));

        assertThat(back).extracting(Header::key).containsExactly("__TypeId__", "dup", "dup", "nullValue");
        assertThat(back.get(0).value()).isEqualTo("uz.efbazaar.X".getBytes(StandardCharsets.UTF_8));
        assertThat(back.get(1).value()).containsExactly(1, 2);
        assertThat(back.get(2).value()).containsExactly(3);
        assertThat(back.get(3).value()).isNull();
    }

    @Test
    void emptyHeadersEncodeAsEmptyArray() {
        assertThat(HeaderCodec.toJson(new RecordHeaders())).isEqualTo("[]");
        assertThat(HeaderCodec.fromJson("[]")).isEmpty();
    }
}
