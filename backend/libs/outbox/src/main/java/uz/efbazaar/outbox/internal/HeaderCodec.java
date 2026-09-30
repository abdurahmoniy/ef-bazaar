package uz.efbazaar.outbox.internal;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.Headers;
import org.apache.kafka.common.header.internals.RecordHeader;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Kafka headerlari JSON massiv sifatida: [{"k": "...", "v": "<base64>|null"}].
 * Massiv — chunki header nomi takrorlanishi mumkin va tartib muhim.
 */
public final class HeaderCodec {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private record Entry(String k, String v) {}

    private HeaderCodec() {
    }

    public static String toJson(Headers headers) {
        List<Entry> entries = new ArrayList<>();
        for (Header h : headers) {
            entries.add(new Entry(h.key(), h.value() == null ? null : Base64.getEncoder().encodeToString(h.value())));
        }
        try {
            return MAPPER.writeValueAsString(entries);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Kafka headerlarini JSON'ga aylantirib bo'lmadi", e);
        }
    }

    public static List<Header> fromJson(String json) {
        try {
            List<Entry> entries = MAPPER.readValue(json, new TypeReference<List<Entry>>() {});
            List<Header> headers = new ArrayList<>(entries.size());
            for (Entry e : entries) {
                headers.add(new RecordHeader(e.k(), e.v() == null ? null : Base64.getDecoder().decode(e.v())));
            }
            return headers;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("outbox headers JSON'i buzilgan: " + json, e);
        }
    }
}
